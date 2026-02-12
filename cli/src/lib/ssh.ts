import { Client } from "ssh2";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

export function getSSHKeyPath(): string {
  // Try common key locations
  const home = os.homedir();
  const keyPaths = [
    path.join(home, ".ssh", "id_ed25519"),
    path.join(home, ".ssh", "id_rsa"),
  ];

  for (const keyPath of keyPaths) {
    if (fs.existsSync(keyPath)) {
      return keyPath;
    }
  }

  throw new Error("No SSH key found. Run: ssh-keygen -t ed25519");
}

export function getSSHPublicKey(): string {
  const privateKeyPath = getSSHKeyPath();
  const publicKeyPath = privateKeyPath + ".pub";

  if (!fs.existsSync(publicKeyPath)) {
    throw new Error(`Public key not found: ${publicKeyPath}`);
  }

  return fs.readFileSync(publicKeyPath, "utf-8").trim();
}

export async function waitForSSH(ip: string, maxAttempts = 30): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      await execSSH(ip, "echo ready", 10000);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 5000));
    }
  }

  throw new Error("Timeout waiting for SSH");
}

export function execSSH(
  ip: string,
  command: string,
  timeout = 120000
): Promise<string> {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    let output = "";
    let errorOutput = "";

    const timer = setTimeout(() => {
      conn.end();
      reject(new Error(`SSH command timeout: ${command}`));
    }, timeout);

    conn.on("ready", () => {
      conn.exec(command, (err, stream) => {
        if (err) {
          clearTimeout(timer);
          conn.end();
          reject(err);
          return;
        }

        stream.on("data", (data: Buffer) => {
          output += data.toString();
        });

        stream.stderr.on("data", (data: Buffer) => {
          errorOutput += data.toString();
        });

        stream.on("close", (code: number) => {
          clearTimeout(timer);
          conn.end();

          if (code !== 0) {
            reject(new Error(`Command failed (${code}): ${errorOutput || output}`));
          } else {
            resolve(output);
          }
        });
      });
    });

    conn.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });

    conn.connect({
      host: ip,
      port: 22,
      username: "root",
      privateKey: fs.readFileSync(getSSHKeyPath()),
      readyTimeout: timeout,
      // TODO: Implement proper host key verification (store fingerprint on first connect)
      hostVerifier: () => true,
    });
  });
}

export async function runCommands(ip: string, commands: string[]): Promise<void> {
  for (const cmd of commands) {
    await execSSH(ip, cmd);
  }
}
