export function CredentialsNotice({ email, password }: { email?: string; password: string }) {
  return (
    <div role="status" className="rounded-[14px] border border-cool bg-white p-4 text-sm">
      <p className="font-medium text-ink">Copy these credentials now. The password is not shown again.</p>
      {email && (
        <p className="mt-2 text-body">
          Email: <span className="font-mono text-ink">{email}</span>
        </p>
      )}
      <p className="text-body">
        Password: <span className="font-mono text-ink select-all">{password}</span>
      </p>
    </div>
  );
}
