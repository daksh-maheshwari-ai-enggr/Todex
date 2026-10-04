import { tool } from "@langchain/core/tools";
import { z } from "zod";
import fs from "fs/promises";
import path from "path";
import { WORKING_DIR } from "../workspace";
import { safePath } from "./fileSystem";

// -----------------------------------------------------------------------------
// Project templates (minimal, working React + TypeScript + Vite scaffold)
// -----------------------------------------------------------------------------

function packageJson(name: string): object {
  return {
    name,
    private: true,
    version: "0.1.0",
    type: "module",
    scripts: {
      dev: "vite",
      build: "tsc && vite build",
      preview: "vite preview",
    },
    dependencies: {
      react: "^18.3.1",
      "react-dom": "^18.3.1",
    },
    devDependencies: {
      "@types/react": "^18.3.5",
      "@types/react-dom": "^18.3.0",
      "@vitejs/plugin-react": "^4.3.1",
      typescript: "^5.6.2",
      vite: "^5.4.8",
    },
  };
}

function indexHtml(name: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${name}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`;
}

const VITE_CONFIG_TS = `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
});
`;

const TSCONFIG_JSON = `{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,

    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",

    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"]
}
`;

const MAIN_TSX = `import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
`;

const APP_TSX = `function App() {
  return (
    <main className="app">
      <h1>⚡ Vite + React + TypeScript</h1>
      <p>Edit src/App.tsx to get started.</p>
    </main>
  );
}

export default App;
`;

const INDEX_CSS = `:root {
  font-family: system-ui, sans-serif;
}

body {
  margin: 0;
}

.app {
  padding: 2rem;
}
`;

// -----------------------------------------------------------------------------
// create_react_project
// -----------------------------------------------------------------------------

/**
 * Scaffold a minimal React + TypeScript + Vite project in a new subdirectory
 * of WORKING_DIR. Refuses to touch an existing directory.
 */
export const createReactProjectTool = tool(
  async ({ project_name }) => {
    try {
      const name = project_name.trim();

      if (name.length === 0 || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name)) {
        return `❌ Invalid project name "${project_name}". Use letters, numbers, dots, dashes, or underscores (must start with a letter or number).`;
      }

      const projectDir = safePath(name);

      // Never overwrite an existing project directory.
      const dirExists = await fs
        .access(projectDir)
        .then(() => true)
        .catch(() => false);

      if (dirExists) {
        return `❌ Directory "${name}" already exists in the working directory. Choose another name or remove the existing directory first.`;
      }

      const files: Array<[relPath: string, content: string]> = [
        ["package.json", JSON.stringify(packageJson(name), null, 2) + "\n"],
        ["index.html", indexHtml(name)],
        ["vite.config.ts", VITE_CONFIG_TS],
        ["tsconfig.json", TSCONFIG_JSON],
        ["src/main.tsx", MAIN_TSX],
        ["src/App.tsx", APP_TSX],
        ["src/index.css", INDEX_CSS],
      ];

      await fs.mkdir(path.join(projectDir, "src"), { recursive: true });

      for (const [relPath, content] of files) {
        await fs.writeFile(path.join(projectDir, relPath), content, "utf-8");
      }

      const fileList = files.map(([relPath]) => relPath).join(", ");
      const relDir = path.relative(WORKING_DIR, projectDir);

      return [
        `✅ Created React + TypeScript + Vite project "${name}" in ${relDir}`,
        `Files: ${fileList}`,
        `Next: run "npm install && npm run dev" inside ${relDir} to start the dev server.`,
      ].join("\n");
    } catch (err: any) {
      return `Error creating React project: ${err.message}`;
    }
  },
  {
    name: "create_react_project",
    description:
      "Scaffold a minimal working React + TypeScript + Vite project in a new subdirectory of the working directory. Refuses to overwrite an existing directory. Run npm install inside it afterwards to get a dev server.",
    schema: z.object({
      project_name: z
        .string()
        .describe(
          'Name of the new project directory, e.g. "my-react-app". Letters, numbers, dots, dashes and underscores only.'
        ),
    }),
  }
);
