import { execSync } from "child_process";
import { basename } from "path";

let detectedProject: string | null = null;
let detected = false;

export function detectProject(): string | null {
  if (detected) return detectedProject;
  detected = true;

  const cwd = process.cwd();

  // Try git remote name first (most unique identifier)
  try {
    const remote = execSync("git remote get-url origin", {
      cwd,
      encoding: "utf-8",
      timeout: 2000,
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();

    if (remote) {
      // Extract "owner/repo" from URL
      const match = remote.match(/[/:]([\w.-]+\/[\w.-]+?)(?:\.git)?$/);
      if (match) {
        detectedProject = match[1];
        return detectedProject;
      }
    }
  } catch {
    // Not a git repo or no remote
  }

  // Fallback: use directory name
  detectedProject = basename(cwd);
  return detectedProject;
}

export function getDetectedProject(): string | null {
  return detectedProject;
}
