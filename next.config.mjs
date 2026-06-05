/**
 * Build-time environment check.
 *
 * Runs whenever `next build` (or `next dev`) evaluates this config — including
 * on Vercel — and prints which required/optional env vars are present vs.
 * missing. It only reports presence (never values) and never fails the build,
 * so a misconfigured deployment is obvious in the build logs instead of only
 * surfacing as a "wallets not enabled" banner at runtime.
 */
function checkEnv() {
  const groups = [
    {
      label: "Core (app won't function without these)",
      required: true,
      vars: ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"],
    },
    {
      label: "On-chain wallets (Circle) — needed to provision wallets & transfer",
      required: false,
      vars: ["CIRCLE_API_KEY", "CIRCLE_ENTITY_SECRET", "CIRCLE_WALLET_SET_ID"],
    },
    {
      label: "AI financial planner (Anthropic)",
      required: false,
      vars: ["ANTHROPIC_API_KEY"],
    },
  ];

  const present = (k) => Boolean(process.env[k] && process.env[k].trim());
  const missingRequired = [];
  const lines = ["", "[env-check] Arjo environment:"];

  for (const g of groups) {
    const have = g.vars.filter(present);
    const miss = g.vars.filter((k) => !present(k));
    lines.push(`  ${g.label}`);
    for (const k of g.vars) {
      lines.push(`    ${present(k) ? "✓" : "✗"} ${k}`);
    }
    if (g.required) missingRequired.push(...miss);
    // A partially-set group is the classic footgun (e.g. some Circle vars set).
    if (!g.required && have.length > 0 && miss.length > 0) {
      lines.push(
        `    ⚠ partially configured — missing: ${miss.join(", ")} (feature disabled)`
      );
    }
  }

  console.log(lines.join("\n"));
  if (missingRequired.length > 0) {
    console.warn(
      `[env-check] ⚠ Missing REQUIRED vars: ${missingRequired.join(", ")} — ` +
        `set them in your environment (Vercel → Settings → Environment Variables).`
    );
  }
  console.log("");
}

checkEnv();

/** @type {import('next').NextConfig} */
const nextConfig = {};

export default nextConfig;
