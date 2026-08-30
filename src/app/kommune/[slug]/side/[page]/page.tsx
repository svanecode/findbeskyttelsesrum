import KommunePage from "../../page";

export { generateMetadata } from "../../metadata";

export const revalidate = 3600;

export function generateStaticParams() {
  return [];
}

export default KommunePage;
