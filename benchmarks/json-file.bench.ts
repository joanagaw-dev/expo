import JSON5 from "json5";
import { bench, describe } from "vitest";

// --- Data generators ---

function generateSmallJson(): string {
  return JSON.stringify({
    name: "my-app",
    version: "1.0.0",
    private: true,
  });
}

function generatePackageJson(): string {
  return JSON.stringify({
    name: "@expo/example-app",
    version: "52.0.0",
    description: "An example Expo application for benchmarking",
    main: "node_modules/expo/AppEntry.js",
    scripts: {
      start: "expo start",
      android: "expo start --android",
      ios: "expo start --ios",
      web: "expo start --web",
      test: "jest --watchAll",
      lint: "eslint . --ext .js,.jsx,.ts,.tsx",
    },
    dependencies: Object.fromEntries(
      Array.from({ length: 50 }, (_, i) => [
        `@expo/package-${i}`,
        `^${Math.floor(i / 10)}.${i % 10}.0`,
      ])
    ),
    devDependencies: Object.fromEntries(
      Array.from({ length: 30 }, (_, i) => [
        `@types/package-${i}`,
        `^${i}.0.0`,
      ])
    ),
    jest: {
      preset: "jest-expo",
      transformIgnorePatterns: [
        "node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules-.*)",
      ],
    },
    expo: {
      name: "my-app",
      slug: "my-app",
      version: "1.0.0",
      orientation: "portrait",
      icon: "./assets/icon.png",
      userInterfaceStyle: "light",
      splash: {
        image: "./assets/splash.png",
        resizeMode: "contain",
        backgroundColor: "#ffffff",
      },
      ios: { supportsTablet: true, bundleIdentifier: "com.example.myapp" },
      android: {
        adaptiveIcon: {
          foregroundImage: "./assets/adaptive-icon.png",
          backgroundColor: "#ffffff",
        },
        package: "com.example.myapp",
      },
      web: { favicon: "./assets/favicon.png" },
      plugins: Array.from({ length: 15 }, (_, i) => `expo-plugin-${i}`),
    },
  });
}

function generateAppConfigJson(): string {
  return JSON.stringify({
    expo: {
      name: "MyExpoApp",
      slug: "my-expo-app",
      version: "1.0.0",
      platforms: ["ios", "android", "web"],
      updates: { fallbackToCacheTimeout: 0 },
      assetBundlePatterns: ["**/*"],
      ios: {
        supportsTablet: true,
        bundleIdentifier: "com.example.app",
        infoPlist: {
          NSCameraUsageDescription:
            "This app uses the camera to scan barcodes.",
          NSLocationWhenInUseUsageDescription:
            "This app uses your location to provide location-based services.",
        },
        config: {
          googleMapsApiKey: "GOOGLE_MAPS_API_KEY",
        },
      },
      android: {
        package: "com.example.app",
        versionCode: 1,
        adaptiveIcon: {
          foregroundImage: "./assets/adaptive-icon.png",
          backgroundColor: "#FFFFFF",
        },
        permissions: [
          "CAMERA",
          "ACCESS_FINE_LOCATION",
          "READ_EXTERNAL_STORAGE",
          "WRITE_EXTERNAL_STORAGE",
        ],
        config: {
          googleMaps: { apiKey: "GOOGLE_MAPS_API_KEY" },
        },
      },
      web: {
        favicon: "./assets/favicon.png",
        bundler: "metro",
      },
      plugins: [
        "expo-router",
        ["expo-camera", { cameraPermission: "Allow camera access" }],
        [
          "expo-location",
          {
            locationAlwaysAndWhenInUsePermission:
              "Allow location access for navigation.",
          },
        ],
        "expo-secure-store",
        "expo-notifications",
      ],
      extra: {
        eas: { projectId: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" },
        environment: "production",
        features: Object.fromEntries(
          Array.from({ length: 20 }, (_, i) => [
            `feature_${i}`,
            { enabled: i % 2 === 0, rolloutPercentage: i * 5 },
          ])
        ),
      },
      hooks: {
        postPublish: [
          {
            file: "sentry-expo/upload-sourcemaps",
            config: {
              organization: "my-org",
              project: "my-project",
            },
          },
        ],
      },
    },
  });
}

function generateLargeJson(): string {
  return JSON.stringify({
    workspaces: Array.from({ length: 200 }, (_, i) => ({
      name: `@expo/workspace-${i}`,
      version: `${Math.floor(i / 10)}.${i % 10}.0`,
      location: `packages/workspace-${i}`,
      dependencies: Object.fromEntries(
        Array.from({ length: 20 }, (_, j) => [
          `dependency-${j}`,
          `^${j}.0.0`,
        ])
      ),
      devDependencies: Object.fromEntries(
        Array.from({ length: 10 }, (_, j) => [
          `dev-dependency-${j}`,
          `^${j}.0.0`,
        ])
      ),
      scripts: {
        build: "tsc",
        test: "jest",
        lint: "eslint .",
        clean: "rm -rf build",
      },
    })),
  });
}

// --- JSON5 test data ---

function generateJson5String(): string {
  return `{
  // App configuration
  name: 'my-expo-app',
  version: '1.0.0',
  private: true,
  /* Multi-line
     comment */
  dependencies: {
    'expo': '^52.0.0',
    'react': '19.2.3',
    'react-native': '0.76.0',
  },
  // Trailing commas are fine in JSON5
  scripts: {
    start: 'expo start',
    build: 'expo build',
    test: 'jest',
  },
}`;
}

// Pre-generate test data
const smallJson = generateSmallJson();
const packageJson = generatePackageJson();
const appConfigJson = generateAppConfigJson();
const largeJson = generateLargeJson();
const json5String = generateJson5String();

// Pre-parse for stringify benchmarks
const smallObj = JSON.parse(smallJson);
const packageObj = JSON.parse(packageJson);
const largeObj = JSON.parse(largeJson);

// --- Benchmarks ---

describe("@expo/json-file - JSON.parse", () => {
  bench("parse small JSON (3 keys)", () => {
    JSON.parse(smallJson);
  });

  bench("parse package.json (~100 deps)", () => {
    JSON.parse(packageJson);
  });

  bench("parse app.json config", () => {
    JSON.parse(appConfigJson);
  });

  bench("parse large workspace JSON (200 packages)", () => {
    JSON.parse(largeJson);
  });
});

describe("@expo/json-file - JSON5.parse", () => {
  bench("parse JSON5 with comments and trailing commas", () => {
    JSON5.parse(json5String);
  });

  bench("parse standard JSON via JSON5 (package.json)", () => {
    JSON5.parse(packageJson);
  });

  bench("parse standard JSON via JSON5 (large)", () => {
    JSON5.parse(largeJson);
  });
});

describe("@expo/json-file - JSON.stringify", () => {
  bench("stringify small object", () => {
    JSON.stringify(smallObj, null, 2);
  });

  bench("stringify package.json object", () => {
    JSON.stringify(packageObj, null, 2);
  });

  bench("stringify large workspace object", () => {
    JSON.stringify(largeObj, null, 2);
  });

  bench("stringify with newline (addNewLineAtEOF pattern)", () => {
    `${JSON.stringify(packageObj, null, 2)}\n`;
  });
});

describe("@expo/json-file - JSON5.stringify", () => {
  bench("JSON5.stringify small object", () => {
    JSON5.stringify(smallObj, null, 2);
  });

  bench("JSON5.stringify package.json object", () => {
    JSON5.stringify(packageObj, null, 2);
  });

  bench("JSON5.stringify large workspace object", () => {
    JSON5.stringify(largeObj, null, 2);
  });
});
