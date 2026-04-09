/**
 * 打 Release APK 前先 versionCode +1，并同步 versionName（补丁位 +1）到
 * android/app/build.gradle、app.json、package.json，再执行 assembleRelease。
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const root = path.join(__dirname, "..");
const gradlePath = path.join(root, "android", "app", "build.gradle");
const appJsonPath = path.join(root, "app.json");
const packageJsonPath = path.join(root, "package.json");

function bumpPatchVersion(ver) {
  const m = ver.match(/^(\d+)\.(\d+)\.(\d+)(.*)$/);
  if (m) {
    return `${m[1]}.${m[2]}.${parseInt(m[3], 10) + 1}${m[4] || ""}`;
  }
  const m2 = ver.match(/^(\d+)\.(\d+)$/);
  if (m2) {
    return `${m2[1]}.${parseInt(m2[2], 10) + 1}.0`;
  }
  return ver;
}

function main() {
  let gradle = fs.readFileSync(gradlePath, "utf8");
  const vcMatch = gradle.match(/versionCode\s+(\d+)/);
  if (!vcMatch) {
    throw new Error("未在 android/app/build.gradle 中找到 versionCode");
  }
  const oldCode = parseInt(vcMatch[1], 10);
  const newCode = oldCode + 1;
  gradle = gradle.replace(/versionCode\s+\d+/, `versionCode ${newCode}`);

  const vnMatch = gradle.match(/versionName\s+"([^"]+)"/);
  if (!vnMatch) {
    throw new Error("未在 android/app/build.gradle 中找到 versionName");
  }
  const oldName = vnMatch[1];
  const newName = bumpPatchVersion(oldName);
  gradle = gradle.replace(/versionName\s+"[^"]+"/, `versionName "${newName}"`);

  fs.writeFileSync(gradlePath, gradle);

  const appJson = JSON.parse(fs.readFileSync(appJsonPath, "utf8"));
  appJson.expo.version = newName;
  if (!appJson.expo.android) {
    appJson.expo.android = {};
  }
  appJson.expo.android.versionCode = newCode;
  fs.writeFileSync(appJsonPath, `${JSON.stringify(appJson, null, 2)}\n`);

  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  pkg.version = newName;
  fs.writeFileSync(packageJsonPath, `${JSON.stringify(pkg, null, 2)}\n`);

  // eslint-disable-next-line no-console
  console.log(`已更新：versionCode ${oldCode} → ${newCode}，versionName ${oldName} → ${newName}`);

  const gradleCmd = process.platform === "win32" ? "gradlew.bat" : "./gradlew";
  execSync(`${gradleCmd} assembleRelease`, {
    cwd: path.join(root, "android"),
    stdio: "inherit",
    shell: true,
    env: process.env
  });
}

main();
