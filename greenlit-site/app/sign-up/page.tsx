import { redirect } from "next/navigation";
import { currentPrincipal, authConfigured } from "../../lib/auth";
import SignUpForm from "./SignUpForm";

export default async function SignUpPage() {
  if (!authConfigured()) redirect("/sign-in");
  // Already signed in: registering again is never what someone meant.
  if (await currentPrincipal()) redirect("/");
  return <SignUpForm />;
}
