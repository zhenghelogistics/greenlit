import { redirect } from "next/navigation";
import { currentPrincipal, authConfigured } from "../../lib/auth";
import SignInForm from "./SignInForm";

/**
 * §7. The door.
 *
 * Deliberately plain: a controller sees this once a day and it has one job.
 * The only thing it says beyond the two fields is what to do when it will not
 * let you in, because that is the moment someone is stuck at seven in the
 * morning with containers waiting.
 */
export default async function SignInPage() {
  if (!authConfigured()) {
    return (
      <main className="mx-auto max-w-[560px] px-6 py-20">
        <h1 className="gl-display">Sign-in is not set up</h1>
        <p className="gl-body mt-4">
          This deployment has no Supabase keys, so nobody can sign in and no
          change could be attributed to a person. Set
          {" "}<code>NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
          <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>, then redeploy.
        </p>
      </main>
    );
  }

  // Already signed in: nobody wants to log in twice.
  if (await currentPrincipal()) redirect("/");

  return <SignInForm />;
}
