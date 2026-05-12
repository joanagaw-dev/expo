import { createHash } from "node:crypto";
import path from "node:path";
import { bench, describe } from "vitest";

// --- Types matching @expo/fingerprint/src/Fingerprint.types.ts ---

interface HashSourceFile {
  type: "file";
  filePath: string;
  reasons: string[];
  overrideHashKey?: string;
}

interface HashSourceDir {
  type: "dir";
  filePath: string;
  reasons: string[];
  overrideHashKey?: string;
}

interface HashSourceContents {
  type: "contents";
  id: string;
  contents: string | Buffer;
  reasons: string[];
}

type HashSource = HashSourceFile | HashSourceDir | HashSourceContents;

// --- Functions from @expo/fingerprint/src/Sort.ts ---

const typeOrder: Record<string, number> = {
  file: 0,
  dir: 1,
  contents: 2,
};

function compareSource(a: HashSource, b: HashSource): number {
  const typeResult = typeOrder[a.type] - typeOrder[b.type];
  if (typeResult === 0) {
    if (a.type === "file" && b.type === "file") {
      const aValue = a.overrideHashKey ?? a.filePath;
      const bValue = b.overrideHashKey ?? b.filePath;
      return aValue.localeCompare(bValue);
    } else if (a.type === "dir" && b.type === "dir") {
      const aValue = a.overrideHashKey ?? a.filePath;
      const bValue = b.overrideHashKey ?? b.filePath;
      return aValue.localeCompare(bValue);
    } else if (a.type === "contents" && b.type === "contents") {
      return a.id.localeCompare(b.id);
    }
  }
  return typeResult;
}

function sortSources<T extends HashSource>(sources: T[]): T[] {
  return sources.sort(compareSource);
}

// --- Functions from @expo/fingerprint/src/Dedup.ts ---

function isDescendant(
  from: HashSourceDir | HashSourceFile,
  to: HashSourceDir | HashSourceFile,
  projectRoot: string
): boolean {
  if (from === to) {
    return true;
  }
  const fromPath = path.join(projectRoot, from.filePath);
  const toPath = path.join(projectRoot, to.filePath);
  const result = path.relative(fromPath, toPath).match(/^[./\\/]*$/) != null;
  return result;
}

function findDuplicatedSourceIndex(
  newSources: HashSource[],
  source: HashSource,
  projectRoot: string
): [number, boolean] {
  let shouldSwapSource = false;
  if (source.type === "contents") {
    return [
      newSources.findIndex(
        (item) => item.type === source.type && item.id === source.id
      ),
      shouldSwapSource,
    ];
  }

  for (const [index, existingSource] of newSources.entries()) {
    if (existingSource.type === "contents") {
      continue;
    }
    if (isDescendant(source, existingSource, projectRoot)) {
      return [index, shouldSwapSource];
    }
    if (isDescendant(existingSource, source, projectRoot)) {
      shouldSwapSource = true;
      return [index, shouldSwapSource];
    }
  }
  return [-1, shouldSwapSource];
}

function dedupSources(
  sources: HashSource[],
  projectRoot: string
): HashSource[] {
  const newSources: HashSource[] = [];
  for (const source of sources) {
    const [duplicatedItemIndex, shouldSwapSource] = findDuplicatedSourceIndex(
      newSources,
      source,
      projectRoot
    );
    if (duplicatedItemIndex >= 0) {
      const duplicatedItem = newSources[duplicatedItemIndex];
      if (shouldSwapSource) {
        newSources[duplicatedItemIndex] = {
          ...source,
          reasons: [...source.reasons, ...duplicatedItem.reasons],
        };
      } else {
        duplicatedItem.reasons = [
          ...duplicatedItem.reasons,
          ...source.reasons,
        ];
      }
    } else {
      newSources.push(source);
    }
  }
  return newSources;
}

// --- Data generators ---

function generateFileSources(count: number): HashSourceFile[] {
  const dirs = [
    "src/components",
    "src/utils",
    "src/screens",
    "src/hooks",
    "src/services",
    "android/app/src/main/java",
    "ios/MyApp",
    "node_modules/react-native/Libraries",
  ];
  return Array.from({ length: count }, (_, i) => ({
    type: "file" as const,
    filePath: `${dirs[i % dirs.length]}/file_${i}.${i % 3 === 0 ? "ts" : i % 3 === 1 ? "java" : "swift"}`,
    reasons: [`reason_${i}`],
  }));
}

function generateDirSources(count: number): HashSourceDir[] {
  return Array.from({ length: count }, (_, i) => ({
    type: "dir" as const,
    filePath: `packages/module_${i}/src`,
    reasons: [`package_${i}`],
  }));
}

function generateContentsSources(count: number): HashSourceContents[] {
  return Array.from({ length: count }, (_, i) => ({
    type: "contents" as const,
    id: `contents_${i}`,
    contents: JSON.stringify({
      name: `package_${i}`,
      version: `${i}.0.0`,
      dependencies: Object.fromEntries(
        Array.from({ length: 10 }, (_, j) => [`dep_${j}`, `^${j}.0.0`])
      ),
    }),
    reasons: [`contents_reason_${i}`],
  }));
}

function generateMixedSources(count: number): HashSource[] {
  const files = generateFileSources(Math.floor(count * 0.6));
  const dirs = generateDirSources(Math.floor(count * 0.2));
  const contents = generateContentsSources(Math.floor(count * 0.2));
  const mixed = [...files, ...dirs, ...contents];
  // Shuffle deterministically
  for (let i = mixed.length - 1; i > 0; i--) {
    const j = ((i * 2654435761) >>> 0) % (i + 1);
    [mixed[i], mixed[j]] = [mixed[j], mixed[i]];
  }
  return mixed;
}

function generateDuplicatedSources(count: number): HashSource[] {
  const sources: HashSource[] = [];
  for (let i = 0; i < count; i++) {
    sources.push({
      type: "dir",
      filePath: `packages/module_${i % 20}`,
      reasons: [`parent_${i}`],
    });
    sources.push({
      type: "file",
      filePath: `packages/module_${i % 20}/src/index.ts`,
      reasons: [`child_${i}`],
    });
    if (i % 3 === 0) {
      sources.push({
        type: "contents",
        id: `unique_${i}`,
        contents: `content_${i}`,
        reasons: [`unique_${i}`],
      });
    }
  }
  return sources;
}

// --- Benchmarks ---

describe("@expo/fingerprint - sortSources", () => {
  const small = generateMixedSources(100);
  const medium = generateMixedSources(1000);
  const large = generateMixedSources(5000);

  bench("sort 100 mixed sources", () => {
    sortSources([...small]);
  });

  bench("sort 1000 mixed sources", () => {
    sortSources([...medium]);
  });

  bench("sort 5000 mixed sources", () => {
    sortSources([...large]);
  });
});

describe("@expo/fingerprint - compareSource", () => {
  const fileA: HashSourceFile = {
    type: "file",
    filePath: "src/components/Button.tsx",
    reasons: ["component"],
  };
  const fileB: HashSourceFile = {
    type: "file",
    filePath: "src/utils/helpers.ts",
    reasons: ["utility"],
  };
  const dirA: HashSourceDir = {
    type: "dir",
    filePath: "android/app/src",
    reasons: ["android"],
  };
  const contentsA: HashSourceContents = {
    type: "contents",
    id: "package.json",
    contents: '{"name":"test"}',
    reasons: ["config"],
  };

  bench("compare two file sources", () => {
    compareSource(fileA, fileB);
  });

  bench("compare file vs dir source", () => {
    compareSource(fileA, dirA);
  });

  bench("compare file vs contents source", () => {
    compareSource(fileA, contentsA);
  });
});

describe("@expo/fingerprint - dedupSources", () => {
  const small = generateDuplicatedSources(50);
  const medium = generateDuplicatedSources(200);
  const large = generateDuplicatedSources(500);

  bench("dedup 50 sources with overlapping paths", () => {
    dedupSources([...small], "/project");
  });

  bench("dedup 200 sources with overlapping paths", () => {
    dedupSources([...medium], "/project");
  });

  bench("dedup 500 sources with overlapping paths", () => {
    dedupSources([...large], "/project");
  });
});

describe("@expo/fingerprint - content hashing", () => {
  const smallContent = JSON.stringify({ name: "test", version: "1.0.0" });
  const mediumContent = JSON.stringify({
    name: "test",
    version: "1.0.0",
    dependencies: Object.fromEntries(
      Array.from({ length: 100 }, (_, i) => [`dep_${i}`, `^${i}.0.0`])
    ),
  });
  const largeContent = JSON.stringify({
    data: Array.from({ length: 1000 }, (_, i) => ({
      id: i,
      name: `item_${i}`,
      nested: { a: i, b: `value_${i}`, c: [i, i + 1, i + 2] },
    })),
  });

  bench("hash small content (sha1)", () => {
    createHash("sha1").update(smallContent).digest("hex");
  });

  bench("hash medium content (sha1)", () => {
    createHash("sha1").update(mediumContent).digest("hex");
  });

  bench("hash large content (sha1)", () => {
    createHash("sha1").update(largeContent).digest("hex");
  });

  bench("hash large content (sha256)", () => {
    createHash("sha256").update(largeContent).digest("hex");
  });
});
