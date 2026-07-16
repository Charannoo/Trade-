export default function LoginPage() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-bold text-center">Sign In</h1>
        <p className="text-zinc-500 text-sm text-center">
          Auth is currently disabled. Enable it by setting AUTH_ENABLED=true in .env.local.
        </p>
      </div>
    </div>
  );
}
