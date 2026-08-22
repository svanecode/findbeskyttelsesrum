import "server-only";

export type PrivacyController = {
  name: string;
  email: string | null;
  address: string | null;
};

export function getPrivacyController(): PrivacyController {
  const name = process.env.PRIVACY_CONTROLLER_NAME?.trim() || "Andreas Svane";
  const email = process.env.PRIVACY_CONTACT_EMAIL?.trim() || null;
  const address = process.env.PRIVACY_CONTROLLER_ADDRESS?.trim() || null;

  if (process.env.VERCEL_ENV === "production" && !email) {
    throw new Error("PRIVACY_CONTACT_EMAIL must be configured before a production build.");
  }

  return { name, email, address };
}
