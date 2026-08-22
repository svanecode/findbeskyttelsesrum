import "server-only";

export type PrivacyController = {
  name: string;
  address: string | null;
};

export function getPrivacyController(): PrivacyController {
  const name = process.env.PRIVACY_CONTROLLER_NAME?.trim() || "Andreas Svane";
  const address = process.env.PRIVACY_CONTROLLER_ADDRESS?.trim() || null;

  return { name, address };
}
