export default function NotFound() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-bgalt">
      <div className="text-center">
        <p className="text-xs uppercase tracking-wider text-accent font-semibold mb-2">404</p>
        <h1 className="font-display text-3xl text-ink mb-2">Not found</h1>
        <a href="/" className="text-accent underline">Back to home</a>
      </div>
    </main>
  );
}
