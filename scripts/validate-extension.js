const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const manifestPath = path.join(root, "manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

function fail(message) {
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) {
    fail(message);
  }
}

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(rel, files);
    } else {
      files.push(rel);
    }
  }
  return files;
}

function readPngSize(file) {
  const bytes = fs.readFileSync(path.join(root, file));
  const signature = "89504e470d0a1a0a";
  assert(bytes.subarray(0, 8).toString("hex") === signature, `${file} is not a PNG`);
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20)
  };
}

assert(manifest.manifest_version === 3, "manifest_version must be 3");
assert(manifest.name === "Web2PDF", "manifest name must be Web2PDF");
assert(manifest.short_name === "Web2PDF", "manifest short_name must be Web2PDF");
assert(manifest.version === "1.0.0", "manifest version must be 1.0.0");
assert(manifest.minimum_chrome_version === "109", "minimum Chrome version must match offscreen API support");

const expectedPermissions = ["activeTab", "downloads", "offscreen", "scripting", "storage"];
assert(JSON.stringify(manifest.permissions || []) === JSON.stringify(expectedPermissions), "permissions are not the approved minimal set");

const expectedHosts = [
  "https://drive.google.com/*",
  "https://docs.google.com/*",
  "https://*.googleusercontent.com/*"
];
assert(JSON.stringify(manifest.host_permissions || []) === JSON.stringify(expectedHosts), "host permissions changed from the approved scoped list");
assert(!JSON.stringify(manifest).includes("unsafe-eval"), "manifest CSP must not allow unsafe-eval");
assert(!JSON.stringify(manifest).includes("unsafe-inline"), "manifest CSP must not allow unsafe-inline");

for (const [size, iconPath] of Object.entries(manifest.icons || {})) {
  const actual = readPngSize(iconPath);
  assert(actual.width === Number(size) && actual.height === Number(size), `${iconPath} must be ${size}x${size}`);
}

for (const iconPath of Object.values(manifest.action.default_icon || {})) {
  assert(fs.existsSync(path.join(root, iconPath)), `${iconPath} is missing`);
}

for (const htmlFile of ["src/popup/popup.html", "src/offscreen/offscreen.html"]) {
  const html = read(htmlFile);
  assert(!/<script(?![^>]*\bsrc=)[^>]*>/i.test(html), `${htmlFile} contains inline script`);
  assert(!/https?:\/\/[^"']+\.js/i.test(html), `${htmlFile} references remote script code`);
}

const runtimeFiles = [
  "manifest.json",
  ...walk("src").filter((file) => /\.(js|html|css)$/i.test(file))
];
const previousName = ["Drive", "2", "PDF"].join("");
const previousShortPrefix = ["D", "2", "P"].join("");
const legacyBrandPattern = new RegExp([
  previousName,
  previousName.toLowerCase(),
  previousShortPrefix,
  previousShortPrefix.toLowerCase()
].join("|"));
for (const file of runtimeFiles) {
  const text = read(file);
  assert(!legacyBrandPattern.test(text), `${file} contains legacy branding`);
  assert(!/\bTODO\b|\bFIXME\b|\bPLACEHOLDER\b|\bTBD\b/i.test(text), `${file} contains unfinished release text`);
  assert(!/\beval\s*\(/.test(text), `${file} contains eval`);
  assert(!/\bnew\s+Function\b/.test(text), `${file} contains new Function`);
  assert(!/document\.write|insertAdjacentHTML|outerHTML|innerHTML/.test(text), `${file} contains unsafe DOM HTML injection`);
  if (file !== "src/shared/logger.js") {
    assert(!/console\./.test(text), `${file} writes directly to console`);
  }
}

for (const asset of [
  "store-assets/web2pdf-screenshot-1280x800.png",
  "store-assets/web2pdf-promo-small-440x280.png"
]) {
  assert(fs.existsSync(path.join(root, asset)), `${asset} is missing`);
}

console.log("Web2PDF release validation passed");
