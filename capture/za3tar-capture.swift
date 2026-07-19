// za3tar-capture — captures system audio + microphone as two separate
// 16 kHz mono WAV files, with no bot and no screen-recording permission.
//
// System audio uses a Core Audio process tap (CATapDescription, macOS 14.4+),
// which has its own audio-only TCC permission. The mic uses AVAudioEngine.
// The two tracks are kept separate so "me" (mic) vs "them" (system) speaker
// attribution comes for free downstream.
//
// Usage:   za3tar-capture <output-dir>
// Writes:  <output-dir>/system.wav  and  <output-dir>/mic.wav
// Stops:   on SIGINT / SIGTERM, finalizes both files, exits 0.
// Emits:   one JSON object per line on stdout (events + periodic levels).

import Foundation
import AudioToolbox
import AVFoundation

// MARK: - tiny JSON line logging to stdout (the Rust side parses these)

let stdoutQueue = DispatchQueue(label: "za3tar.stdout")
func emit(_ obj: [String: Any]) {
    guard let data = try? JSONSerialization.data(withJSONObject: obj),
          let line = String(data: data, encoding: .utf8) else { return }
    stdoutQueue.sync {
        FileHandle.standardOutput.write(Data((line + "\n").utf8))
    }
}
func fail(_ message: String, code: Int32 = 1) -> Never {
    emit(["event": "error", "message": message])
    exit(code)
}

extension String: @retroactive Error {} // lets us `throw "message"`

// MARK: - minimal Core Audio property reads (translated from Apple's AudioCap)

let kSystemObject = AudioObjectID(kAudioObjectSystemObject)

func readDefaultSystemOutputDevice() throws -> AudioDeviceID {
    var addr = AudioObjectPropertyAddress(
        mSelector: kAudioHardwarePropertyDefaultSystemOutputDevice,
        mScope: kAudioObjectPropertyScopeGlobal,
        mElement: kAudioObjectPropertyElementMain)
    var devID = AudioDeviceID(kAudioObjectUnknown)
    var size = UInt32(MemoryLayout<AudioDeviceID>.size)
    let err = AudioObjectGetPropertyData(kSystemObject, &addr, 0, nil, &size, &devID)
    guard err == noErr else { throw "read default output device failed: \(err)" }
    return devID
}

func readDeviceUID(_ devID: AudioDeviceID) throws -> String {
    var addr = AudioObjectPropertyAddress(
        mSelector: kAudioDevicePropertyDeviceUID,
        mScope: kAudioObjectPropertyScopeGlobal,
        mElement: kAudioObjectPropertyElementMain)
    var uid: CFString = "" as CFString
    var size = UInt32(MemoryLayout<CFString>.size)
    let err = withUnsafeMutablePointer(to: &uid) {
        AudioObjectGetPropertyData(devID, &addr, 0, nil, &size, $0)
    }
    guard err == noErr else { throw "read device UID failed: \(err)" }
    return uid as String
}

func readTapStreamFormat(_ tapID: AudioObjectID) throws -> AudioStreamBasicDescription {
    var addr = AudioObjectPropertyAddress(
        mSelector: kAudioTapPropertyFormat,
        mScope: kAudioObjectPropertyScopeGlobal,
        mElement: kAudioObjectPropertyElementMain)
    var asbd = AudioStreamBasicDescription()
    var size = UInt32(MemoryLayout<AudioStreamBasicDescription>.size)
    let err = withUnsafeMutablePointer(to: &asbd) {
        AudioObjectGetPropertyData(tapID, &addr, 0, nil, &size, $0)
    }
    guard err == noErr else { throw "read tap format failed: \(err)" }
    return asbd
}

// MARK: - 16 kHz mono Int16 target + WAV writer settings

let targetSampleRate = 16_000.0
func targetFormat() -> AVAudioFormat {
    AVAudioFormat(commonFormat: .pcmFormatInt16,
                  sampleRate: targetSampleRate,
                  channels: 1,
                  interleaved: true)!
}
let wavSettings: [String: Any] = [
    AVFormatIDKey: kAudioFormatLinearPCM,
    AVSampleRateKey: targetSampleRate,
    AVNumberOfChannelsKey: 1,
    AVLinearPCMBitDepthKey: 16,
    AVLinearPCMIsFloatKey: false,
    AVLinearPCMIsBigEndianKey: false,
    AVLinearPCMIsNonInterleaved: false,
]

// Converts one input buffer to 16 kHz mono Int16 and writes it, tracking peak
// level so we can prove the track isn't silent.
final class TrackWriter {
    let name: String
    let file: AVAudioFile
    let converter: AVAudioConverter
    let target: AVAudioFormat
    private var peak: Float = 0
    private var peakEver: Float = 0
    private var frames: Int64 = 0
    private var callbacks: Int64 = 0
    private var inputFrames: Int64 = 0
    private var lastEmit = Date.distantPast
    private var silenceHinted = false

    init(name: String, url: URL, inputFormat: AVAudioFormat) throws {
        self.name = name
        self.target = targetFormat()
        guard let conv = AVAudioConverter(from: inputFormat, to: target) else {
            throw "\(name): could not build converter from \(inputFormat)"
        }
        self.converter = conv
        self.file = try AVAudioFile(forWriting: url, settings: wavSettings,
                                    commonFormat: .pcmFormatInt16, interleaved: true)
    }

    func write(_ input: AVAudioPCMBuffer) {
        callbacks += 1
        inputFrames += Int64(input.frameLength)
        let ratio = target.sampleRate / input.format.sampleRate
        let capacity = AVAudioFrameCount(Double(input.frameLength) * ratio) + 16
        guard let out = AVAudioPCMBuffer(pcmFormat: target, frameCapacity: capacity) else { return }
        var consumed = false
        var convError: NSError?
        let status = converter.convert(to: out, error: &convError) { _, statusPtr in
            if consumed { statusPtr.pointee = .noDataNow; return nil }
            consumed = true
            statusPtr.pointee = .haveData
            return input
        }
        if status == .error { maybeEmitLevel(); return }
        guard out.frameLength > 0 else { maybeEmitLevel(); return }

        // peak-track the Int16 output for a cheap non-silence signal
        if let ch = out.int16ChannelData {
            let n = Int(out.frameLength)
            var localPeak: Int16 = 0
            for i in 0..<n { localPeak = max(localPeak, abs(ch[0][i])) }
            let p = Float(localPeak) / 32768.0
            peak = max(peak, p)
            peakEver = max(peakEver, p)
        }
        frames += Int64(out.frameLength)

        // If the tap is streaming (callbacks firing) but every sample is
        // silent for a while, the audio-recording permission almost certainly
        // isn't granted — surface that once so the app can guide the user.
        if !silenceHinted, name == "system", peakEver == 0,
           Double(frames) / targetSampleRate > 3.0 {
            silenceHinted = true
            emit(["event": "permission_hint", "track": name,
                  "message": "System audio is streaming but silent — grant " +
                             "\"System Audio Recording\" in System Settings › " +
                             "Privacy & Security, then restart the recording."])
        }

        do { try file.write(from: out) }
        catch { emit(["event": "error", "track": name, "message": "\(error)"]) }

        maybeEmitLevel()
    }

    private func maybeEmitLevel() {
        let now = Date()
        if now.timeIntervalSince(lastEmit) > 1.0 {
            lastEmit = now
            emit(["event": "level", "track": name, "peak": Double(peak),
                  "callbacks": callbacks, "seconds": Double(frames) / targetSampleRate])
            peak = 0
        }
    }

    func seconds() -> Double { Double(frames) / targetSampleRate }

    func summary() -> [String: Any] {
        ["callbacks": callbacks, "inputFrames": inputFrames,
         "outputFrames": frames, "seconds": Double(frames) / targetSampleRate]
    }
}

// MARK: - system audio via process tap

final class SystemAudioCapture {
    private var tapID = AudioObjectID(kAudioObjectUnknown)
    private var aggID = AudioObjectID(kAudioObjectUnknown)
    private var procID: AudioDeviceIOProcID?
    private let ioQueue = DispatchQueue(label: "za3tar.tap.io", qos: .userInitiated)
    private var writer: TrackWriter?

    func start(outputURL: URL) throws {
        // global tap of all system audio; empty exclude list = capture everything.
        let desc = CATapDescription(monoGlobalTapButExcludeProcesses: [])
        desc.uuid = UUID()
        desc.muteBehavior = .unmuted

        var tap = AudioObjectID(kAudioObjectUnknown)
        let terr = AudioHardwareCreateProcessTap(desc, &tap)
        guard terr == noErr, tap != AudioObjectID(kAudioObjectUnknown) else {
            throw "AudioHardwareCreateProcessTap failed (\(terr)). " +
                  "This usually means the audio-recording permission was denied or " +
                  "the binary is unsigned (the TCC prompt only fires for signed binaries)."
        }
        tapID = tap

        let outDev = try readDefaultSystemOutputDevice()
        let outUID = try readDeviceUID(outDev)
        let aggUID = UUID().uuidString
        let aggDesc: [String: Any] = [
            kAudioAggregateDeviceNameKey: "za3tar-tap",
            kAudioAggregateDeviceUIDKey: aggUID,
            kAudioAggregateDeviceMainSubDeviceKey: outUID,
            kAudioAggregateDeviceIsPrivateKey: true,
            kAudioAggregateDeviceIsStackedKey: false,
            kAudioAggregateDeviceTapAutoStartKey: true,
            kAudioAggregateDeviceSubDeviceListKey: [[kAudioSubDeviceUIDKey: outUID]],
            kAudioAggregateDeviceTapListKey: [[
                kAudioSubTapDriftCompensationKey: true,
                kAudioSubTapUIDKey: desc.uuid.uuidString,
            ]],
        ]
        var asbd = try readTapStreamFormat(tapID)
        guard let inFormat = AVAudioFormat(streamDescription: &asbd) else {
            throw "could not build AVAudioFormat from tap stream description"
        }

        var agg = AudioObjectID(kAudioObjectUnknown)
        let aerr = AudioHardwareCreateAggregateDevice(aggDesc as CFDictionary, &agg)
        guard aerr == noErr else { throw "AudioHardwareCreateAggregateDevice failed (\(aerr))" }
        aggID = agg

        let w = try TrackWriter(name: "system", url: outputURL, inputFormat: inFormat)
        writer = w

        let block: AudioDeviceIOBlock = { _, inInputData, _, _, _ in
            guard let buffer = AVAudioPCMBuffer(pcmFormat: inFormat,
                                                bufferListNoCopy: inInputData,
                                                deallocator: nil) else { return }
            w.write(buffer)
        }
        var perr = AudioDeviceCreateIOProcIDWithBlock(&procID, aggID, ioQueue, block)
        guard perr == noErr, procID != nil else { throw "create IOProc failed (\(perr))" }
        perr = AudioDeviceStart(aggID, procID)
        guard perr == noErr else { throw "AudioDeviceStart failed (\(perr))" }

        emit(["event": "track_started", "track": "system",
              "sampleRate": inFormat.sampleRate, "channels": Int(inFormat.channelCount)])
    }

    func stop() {
        if aggID != AudioObjectID(kAudioObjectUnknown) {
            AudioDeviceStop(aggID, procID)
            if let p = procID { AudioDeviceDestroyIOProcID(aggID, p); procID = nil }
            AudioHardwareDestroyAggregateDevice(aggID)
            aggID = AudioObjectID(kAudioObjectUnknown)
        }
        if tapID != AudioObjectID(kAudioObjectUnknown) {
            AudioHardwareDestroyProcessTap(tapID)
            tapID = AudioObjectID(kAudioObjectUnknown)
        }
        if let sum = writer?.summary() {
            emit(["event": "track_stopped", "track": "system"].merging(sum) { a, _ in a })
        }
        writer = nil
    }
}

// MARK: - mic via AVAudioEngine

final class MicCapture {
    private let engine = AVAudioEngine()
    private var writer: TrackWriter?

    func start(outputURL: URL) throws {
        let input = engine.inputNode
        let inFormat = input.outputFormat(forBus: 0)
        guard inFormat.sampleRate > 0 else { throw "mic input format unavailable (permission denied?)" }
        let w = try TrackWriter(name: "mic", url: outputURL, inputFormat: inFormat)
        writer = w
        input.installTap(onBus: 0, bufferSize: 4096, format: inFormat) { buffer, _ in
            w.write(buffer)
        }
        engine.prepare()
        try engine.start()
        emit(["event": "track_started", "track": "mic",
              "sampleRate": inFormat.sampleRate, "channels": Int(inFormat.channelCount)])
    }

    func stop() {
        engine.inputNode.removeTap(onBus: 0)
        if engine.isRunning { engine.stop() }
        if let sum = writer?.summary() {
            emit(["event": "track_stopped", "track": "mic"].merging(sum) { a, _ in a })
        }
        writer = nil
    }
}

// MARK: - main

let args = CommandLine.arguments
guard args.count >= 2 else { fail("usage: za3tar-capture <output-dir>") }
let outDir = URL(fileURLWithPath: args[1], isDirectory: true)
try? FileManager.default.createDirectory(at: outDir, withIntermediateDirectories: true)
let systemURL = outDir.appendingPathComponent("system.wav")
let micURL = outDir.appendingPathComponent("mic.wav")
// AVAudioFile won't overwrite; clear stale files from a prior run.
try? FileManager.default.removeItem(at: systemURL)
try? FileManager.default.removeItem(at: micURL)

let system = SystemAudioCapture()
let mic = MicCapture()

// graceful shutdown on SIGINT/SIGTERM
var stopping = false
func shutdown() {
    if stopping { return }
    stopping = true
    system.stop()
    mic.stop()
    emit(["event": "stopped"])
    exit(0)
}
var signalSources: [DispatchSourceSignal] = []
for sig in [SIGINT, SIGTERM] {
    signal(sig, SIG_IGN) // ignore default handler; the dispatch source handles it
    let src = DispatchSource.makeSignalSource(signal: sig, queue: .main)
    src.setEventHandler { shutdown() }
    src.resume()
    signalSources.append(src) // retained for the process lifetime
}

do {
    // mic first so a system-tap permission denial doesn't lose the mic track
    try mic.start(outputURL: micURL)
} catch {
    emit(["event": "error", "track": "mic", "message": "\(error)"])
}
do {
    try system.start(outputURL: systemURL)
} catch {
    emit(["event": "error", "track": "system", "message": "\(error)"])
}

emit(["event": "started", "outputDir": outDir.path])
RunLoop.main.run()
