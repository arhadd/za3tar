import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

function App() {
  // ping the rust side so M0 proves the js↔rust bridge is alive
  const [backend, setBackend] = useState<string>("…");

  useEffect(() => {
    invoke<string>("greet", { name: "za3tar" })
      .then(setBackend)
      .catch((e) => setBackend(`bridge error: ${e}`));
  }, []);

  return (
    <main className="flex min-h-full flex-col items-center justify-center gap-8 p-8 text-center">
      <div className="flex flex-col items-center gap-3">
        <div className="text-6xl">🌿</div>
        <h1 className="text-5xl font-bold tracking-tight text-olive-deep">
          za3tar
        </h1>
        <p className="max-w-md text-lg text-ink-soft">
          the arabeezy granola alternative — meeting notes that actually
          understand عربيزي code-switching.
        </p>
      </div>

      <div className="rounded-full bg-sesame px-4 py-1.5 text-sm text-ink-soft">
        backend says:{" "}
        <span className="font-medium text-olive-deep">{backend}</span>
      </div>
    </main>
  );
}

export default App;
