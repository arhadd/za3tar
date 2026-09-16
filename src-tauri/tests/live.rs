// Live-API integration tests for the actions layer. These hit the real
// Anthropic / ElevenLabs APIs with the keys from .env, so they're #[ignore]d
// by default — run explicitly with:
//
//   cargo test --test live -- --ignored --nocapture
//
// TEST_MIC_WAV=<path to a real mic.wav> additionally exercises the diarized
// in-person transcription path.

use za3tar_lib::{actions, asr};

fn synthetic_dir() -> std::path::PathBuf {
    let dir = std::env::temp_dir().join(format!("za3tar-live-test-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();

    // A realistic Ammani business chat: Arabic/English code-switching, clear
    // decisions, actions on both sides, dates, and one open question.
    let segments = vec![
        asr::Segment { speaker: "me".into(), start: 0.0, text: "أهلاً رانيا، شكراً إنك لحقتي تجي اليوم. حابب نحكي عن الـ workshop تبع الـ community اللي حكينا عنه".into() },
        asr::Segment { speaker: "them".into(), start: 9.0, text: "أكيد. إحنا مبسوطين بالفكرة، بس بدنا نحدد الـ scope والـ budget قبل ما نمشي".into() },
        asr::Segment { speaker: "me".into(), start: 17.0, text: "تمام. اقتراحي نبدأ بـ pilot صغير، يوم واحد، حوالي 30 participants. بقدر أبعتلك proposal مفصل مع الـ pricing يوم الخميس".into() },
        asr::Segment { speaker: "them".into(), start: 30.0, text: "الخميس منيح. إذا وصلنا الـ proposal قبل نهاية الأسبوع منقدر ناخذ approval من الـ management بسرعة".into() },
        asr::Segment { speaker: "me".into(), start: 40.0, text: "ممتاز. في إشي بحتاجه منك — لستة بالـ members المهتمين عشان نبني الـ content حسب مستواهم".into() },
        asr::Segment { speaker: "them".into(), start: 48.0, text: "ماشي، ببعتلك الـ list بكرا الصبح. بس لسا ما قررنا وين نعمل الحدث، عنا قاعة صغيرة بس يمكن ما تكفي".into() },
        asr::Segment { speaker: "me".into(), start: 58.0, text: "خلينا نخلي موضوع الـ venue مفتوح هلأ. المهم اتفقنا: pilot يوم واحد، 30 مشارك، وأنا ببعت الـ proposal الخميس. منعمل call يوم الاثنين نأكد كل إشي".into() },
        asr::Segment { speaker: "them".into(), start: 70.0, text: "اتفقنا. الاثنين الساعة 11 منيح؟ وخلينا نجرب نحكي مع الـ venue partners تبعونكم كمان".into() },
    ];
    std::fs::write(
        dir.join("transcript.json"),
        serde_json::to_string_pretty(&segments).unwrap(),
    )
    .unwrap();
    dir
}

#[tokio::test]
#[ignore]
async fn extract_actions_and_draft_followup() {
    let _ = dotenvy::dotenv();
    let dir = synthetic_dir();
    let dir_s = dir.to_string_lossy().to_string();

    let extracted = actions::extract_actions(
        dir_s.clone(),
        Some("community workshop مع رانيا".into()),
        Some("2026-07-24 (Friday)".into()),
    )
    .await
    .expect("extract_actions failed");

    println!("== decisions ==\n{:#?}", extracted.decisions);
    println!("== actions ==\n{:#?}", extracted.actions);
    println!("== questions ==\n{:#?}", extracted.questions);

    assert!(!extracted.decisions.is_empty(), "no decisions extracted");
    assert!(
        extracted.actions.len() >= 2,
        "expected at least two actions"
    );
    assert!(!extracted.questions.is_empty(), "venue question missed");
    // both sides committed to something
    let owners: Vec<&str> = extracted.actions.iter().map(|a| a.owner.as_str()).collect();
    assert!(owners.contains(&"me"), "no action owned by me: {owners:?}");
    assert!(
        owners.iter().any(|o| *o != "me"),
        "no action owned by the other side: {owners:?}"
    );
    // at least one resolved, well-formed date (Thursday proposal / Monday call)
    assert!(
        extracted
            .actions
            .iter()
            .filter_map(|a| a.due_date.as_deref())
            .any(|d| d.len() == 10 && d.starts_with("2026-")),
        "no resolved due_date"
    );
    // actions.json persisted for the UI to reload
    assert!(dir.join("actions.json").exists());

    let wa = actions::draft_followup(dir_s.clone(), "whatsapp".into(), None)
        .await
        .expect("whatsapp draft failed");
    println!("== whatsapp draft ==\n{}", wa.body);
    assert!(
        wa.body
            .chars()
            .any(|c| ('\u{0600}'..='\u{06FF}').contains(&c)),
        "whatsapp draft lost the Arabic"
    );
    assert!(wa.body.len() > 80, "draft suspiciously short");

    let em = actions::draft_followup(dir_s.clone(), "email".into(), None)
        .await
        .expect("email draft failed");
    println!("== email subject ==\n{:?}", em.subject);
    println!("== email body ==\n{}", em.body);
    assert!(
        em.subject
            .as_deref()
            .map(|s| !s.is_empty())
            .unwrap_or(false),
        "email needs a subject"
    );

    // chase the first extracted action with a nudge draft
    let first_id = extracted.actions[0].id;
    let nudge = actions::draft_nudge(dir_s, first_id, Some("community workshop مع رانيا".into()))
        .await
        .expect("nudge draft failed");
    println!("== nudge ==\n{}", nudge.body);
    assert!(
        nudge
            .body
            .chars()
            .any(|c| ('\u{0600}'..='\u{06FF}').contains(&c)),
        "nudge lost the Arabic"
    );
}

#[tokio::test]
#[ignore]
async fn diarized_in_person_transcription() {
    let _ = dotenvy::dotenv();
    let Ok(src) = std::env::var("TEST_MIC_WAV") else {
        eprintln!("TEST_MIC_WAV not set — skipping");
        return;
    };
    let dir = std::env::temp_dir().join(format!("za3tar-diarize-test-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    // mic only, no system.wav → exercises the in-person relabel path
    std::fs::copy(&src, dir.join("mic.wav")).expect("copy mic.wav");

    let segments = asr::transcribe_dir(&dir).await.expect("transcribe failed");
    for s in &segments {
        println!("[{} {:>6.1}s] {}", s.speaker, s.start, s.text);
    }
    assert!(!segments.is_empty());
}

/// The onboarding conversation: a new user names what they work on, the
/// brain must answer with workspaces and threads, not prose. Needs
/// ANTHROPIC_API_KEY; run with `cargo test --test live -- --ignored onboarding`.
#[tokio::test]
#[ignore]
async fn onboarding_turn_creates_workspaces_and_threads() {
    let _ = dotenvy::dotenv();
    let _ = dotenvy::from_path(std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../.env"));
    let snapshot = "MODE: onboarding — new user, empty app; build workspaces, threads, people from what they say.\nHOME view: everything across all workspaces · today 2026-09-17\nworkspaces: [personal] Personal\n\nthreads:\n\nopen items (0):\n\nstate: not recording; view home";
    let transcript = "Za3tar: Hi, I'm Za3tar. What are you working on these days? Name the two or three things, in any language.\nUser: طيب، عندي شركة اسمها Madar بنعمل onboarding لعملاء جداد مع Lina، وعندي بيت في سريلانكا عم نبنيه لازم يخلص قبل رأس السنة، وشغلة شخصية: interview prep.";
    let v = za3tar_lib::live::live_turn(snapshot.into(), transcript.into(), Some(true))
        .await
        .expect("turn");
    println!("{}", serde_json::to_string_pretty(&v).unwrap());
    let ops = v["ops"].as_array().cloned().unwrap_or_default();
    let kinds: Vec<&str> = ops.iter().filter_map(|o| o["op"].as_str()).collect();
    assert!(
        kinds.contains(&"create_workspace"),
        "expected a workspace op, got {kinds:?}"
    );
    assert!(
        kinds.contains(&"create_thread"),
        "expected a thread op, got {kinds:?}"
    );
    assert!(!v["say"].as_str().unwrap_or("").is_empty());
}
