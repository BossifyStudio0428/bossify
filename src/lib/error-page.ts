export function renderErrorPage() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
    <title>Bossify</title>
    <style>
      :root { color-scheme: light; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f4f3f8; color: #1e1333; }
      main { width: min(420px, calc(100vw - 40px)); text-align: center; }
      h1 { margin: 0 0 10px; font-size: 28px; line-height: 1.1; }
      p { margin: 0 0 24px; color: #62566f; font-size: 15px; line-height: 1.5; }
      .actions { display: flex; justify-content: center; gap: 10px; flex-wrap: wrap; }
      a, button { border: 0; border-radius: 12px; padding: 12px 16px; font: inherit; font-weight: 700; text-decoration: none; cursor: pointer; }
      button { background: #1e1333; color: white; }
      a { background: white; color: #1e1333; box-shadow: inset 0 0 0 1px rgba(30, 19, 51, 0.12); }
    </style>
  </head>
  <body>
    <main>
      <h1>Bossify is restarting</h1>
      <p>Please refresh once. If it keeps happening, the error has been logged for diagnosis.</p>
      <div class="actions">
        <button onclick="location.reload()">Refresh</button>
        <a href="/">Go home</a>
      </div>
    </main>
  </body>
</html>`;
}