import { errorTracker } from "@/lib/errorTracking";

try {
  errorTracker.initialize();
} catch (error) {
  if (process.env.NODE_ENV === "development") {
    console.error("Could not initialize client error tracking:", error);
  }
}
