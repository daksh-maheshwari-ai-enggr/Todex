import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { parse } from "@babel/parser";
import fs from "fs/promises";
import path from "path";

import { safePath } from "./fileSystem";

/* =========================================================
   Types
========================================================= */

type Structure = {
    imports: {
        source: string;
        specifiers: string[];
        line: number;
    }[];

    exports: string[];

    functions: {
        name: string;
        params: string[];
        async: boolean;
        generator: boolean;
        exported: boolean;
        returnType?: string;
        line: number;
    }[];

    classes: {
        name: string;
        superClass?: string;
        exported: boolean;
        line: number;
        methods: {
            name: string;
            kind: string;
            static: boolean;
            abstract: boolean;
            access?: string;
        }[];
    }[];

    types: {
        kind: string;
        name: string;
        members?: string[];
        line: number;
    }[];

    variables: {
        kind: string;
        name: string;
        exported: boolean;
        line: number;
    }[];
};

/* =========================================================
   Helpers
========================================================= */

/**
 * Get the source text represented by a Babel node.
 *
 * This is intentionally used only for small pieces like
 * parameters, return types, extends clauses, etc.
 */
function nodeText(node: any, source: string): string {
    if (!node || node.start == null || node.end == null) {
        return "";
    }

    return source
        .slice(node.start, node.end)
        .replace(/\s+/g, " ")
        .trim();
}

/**
 * Get a safe line number from a Babel node.
 */
function getLine(node: any): number {
    return node?.loc?.start?.line ?? 0;
}

/**
 * Extract a readable identifier from different Babel nodes.
 */
function getName(node: any): string {
    if (!node) return "?";

    if (node.name) {
        return node.name;
    }

    if (node.id?.name) {
        return node.id.name;
    }

    return "?";
}

/**
 * Format function/class parameters.
 *
 * Unlike the original implementation, this uses Babel's source
 * positions so complex TS parameters are preserved correctly:
 *
 *   user: User
 *   options?: Options
 *   { name }: User
 *   ...args: string[]
 */
function formatParams(params: any[], source: string): string[] {
    return params.map((param) => {
        return nodeText(param, source) || "?";
    });
}

/**
 * Get TypeScript return type.
 */
function getReturnType(node: any, source: string): string | undefined {
    if (!node?.returnType) {
        return undefined;
    }

    const type = node.returnType.typeAnnotation;

    if (!type) {
        return undefined;
    }

    return nodeText(type, source);
}

/**
 * Extract variable names from a variable declaration.

 *
 * Handles:
 *
 *   const x = 1;
 *   const a = 1, b = 2;
 *   const { name } = user;
 *   const [a, b] = arr;
 */
function extractVariableNames(pattern: any): string[] {
    if (!pattern) {
        return [];
    }

    if (pattern.type === "Identifier") {
        return [pattern.name];
    }

    if (pattern.type === "ObjectPattern") {
        return pattern.properties.flatMap((property: any) => {
            if (property.type === "ObjectProperty") {
                return extractVariableNames(property.value);
            }

            if (property.type === "RestElement") {
                return extractVariableNames(property.argument);
            }

            return [];
        });
    }

    if (pattern.type === "ArrayPattern") {
        return pattern.elements.flatMap((element: any) =>
            extractVariableNames(element)
        );
    }

    if (pattern.type === "RestElement") {
        return extractVariableNames(pattern.argument);
    }

    if (pattern.type === "AssignmentPattern") {
        return extractVariableNames(pattern.left);
    }

    return [];
}

/* =========================================================
   AST Extraction
========================================================= */

function extractStructure(ast: any, source: string): Structure {
    const result: Structure = {
        imports: [],
        exports: [],
        functions: [],
        classes: [],
        types: [],
        variables: [],
    };

    /*
     * We intentionally inspect PROGRAM-LEVEL declarations here.
     *
     * We don't recursively collect every variable/function inside
     * another function because that would make the result noisy.
     *
     * Classes are inspected separately for their methods.
     */

    const body = ast.program?.body ?? [];

    for (const node of body) {
        /* -------------------------------------------------------
           Imports
        ------------------------------------------------------- */

        if (node.type === "ImportDeclaration") {
            const specifiers = node.specifiers.map((specifier: any) => {
                switch (specifier.type) {
                    case "ImportDefaultSpecifier":
                        return specifier.local?.name ?? "default";

                    case "ImportNamespaceSpecifier":
                        return `* as ${specifier.local?.name ?? "?"}`;

                    case "ImportSpecifier": {
                        const imported =
                            specifier.imported?.name ??
                            specifier.imported?.value ??
                            "?";

                        const local = specifier.local?.name;

                        return local && local !== imported
                            ? `${imported} as ${local}`
                            : imported;
                    }

                    default:
                        return "?";
                }
            });

            result.imports.push({
                source: node.source?.value ?? "",
                specifiers,
                line: getLine(node),
            });

            continue;
        }

        /* -------------------------------------------------------
           Export declarations
        ------------------------------------------------------- */

        if (node.type === "ExportDefaultDeclaration") {
            result.exports.push("default");

            const declaration = node.declaration;

            if (
                declaration?.type === "FunctionDeclaration" ||
                declaration?.type === "ClassDeclaration"
            ) {
                processDeclaration(
                    declaration,
                    true,
                    result,
                    source
                );
            }

            continue;
        }

        if (node.type === "ExportNamedDeclaration") {
            /*
             * export { foo, bar }
             */
            if (node.specifiers?.length) {
                for (const specifier of node.specifiers) {
                    const exported =
                        specifier.exported?.name ??
                        specifier.exported?.value ??
                        "?";

                    result.exports.push(exported);
                }
            }

            /*
             * export const x = ...
             * export function foo() {}
             * export class Foo {}
             * export interface User {}
             */
            if (node.declaration) {
                processDeclaration(
                    node.declaration,
                    true,
                    result,
                    source
                );
            }

            continue;
        }

        /* -------------------------------------------------------
           Normal top-level declarations
        ------------------------------------------------------- */

        processDeclaration(
            node,
            false,
            result,
            source
        );
    }

    return result;
}

/**
 * Process one top-level declaration.
 */
function processDeclaration(
    node: any,
    exported: boolean,
    result: Structure,
    source: string
) {
    if (!node) {
        return;
    }

    /* -------------------------------------------------------
       Function
    ------------------------------------------------------- */

    if (node.type === "FunctionDeclaration") {
        result.functions.push({
            name: getName(node),
            params: formatParams(node.params ?? [], source),
            async: Boolean(node.async),
            generator: Boolean(node.generator),
            exported,
            returnType: getReturnType(node, source),
            line: getLine(node),
        });

        return;
    }

    /* -------------------------------------------------------
       Class
    ------------------------------------------------------- */

    if (node.type === "ClassDeclaration") {
        const className = getName(node);

        const classInfo: Structure["classes"][number] = {
            name: className,
            exported,
            line: getLine(node),
            methods: [],
        };

        if (node.superClass) {
            classInfo.superClass = nodeText(
                node.superClass,
                source
            );
        }

        for (const member of node.body?.body ?? []) {
            if (
                member.type !== "ClassMethod" &&
                member.type !== "ClassPrivateMethod" &&
                member.type !== "TSDeclareMethod"
            ) {
                continue;
            }

            let methodName = "?";

            if (member.key?.name) {
                methodName = member.key.name;
            } else if (member.key?.value != null) {
                methodName = String(member.key.value);
            } else if (member.key?.type === "PrivateName") {
                methodName = `#${member.key.id?.name ?? "?"}`;
            }

            classInfo.methods.push({
                name: methodName,
                kind: member.kind ?? "method",
                static: Boolean(member.static),
                abstract: Boolean(member.abstract),
                access: member.access,
            });
        }

        result.classes.push(classInfo);

        return;
    }

    /* -------------------------------------------------------
       TypeScript Interface
    ------------------------------------------------------- */

    if (node.type === "TSInterfaceDeclaration") {
        const members =
            node.body?.body?.map((member: any) =>
                nodeText(member, source)
            ) ?? [];

        result.types.push({
            kind: "interface",
            name: getName(node),
            members,
            line: getLine(node),
        });

        return;
    }

    /* -------------------------------------------------------
       TypeScript Type Alias
    ------------------------------------------------------- */

    if (node.type === "TSTypeAliasDeclaration") {
        result.types.push({
            kind: "type",
            name: getName(node),
            members: [
                node.typeAnnotation
                    ? nodeText(node.typeAnnotation, source)
                    : "",
            ].filter(Boolean),
            line: getLine(node),
        });

        return;
    }

    /* -------------------------------------------------------
       TypeScript Enum
    ------------------------------------------------------- */

    if (node.type === "TSEnumDeclaration") {
        const members =
            node.members?.map((member: any) =>
                nodeText(member, source)
            ) ?? [];

        result.types.push({
            kind: "enum",
            name: getName(node),
            members,
            line: getLine(node),
        });

        return;
    }

    /* -------------------------------------------------------
       Variables
    ------------------------------------------------------- */

    if (node.type === "VariableDeclaration") {
        for (const declaration of node.declarations ?? []) {
            const names = extractVariableNames(
                declaration.id
            );

            for (const name of names) {
                result.variables.push({
                    kind: node.kind ?? "const",
                    name,
                    exported,
                    line: getLine(node),
                });
            }
        }

        return;
    }

    /* -------------------------------------------------------
       TS Namespace
    ------------------------------------------------------- */

    if (node.type === "TSModuleDeclaration") {
        result.types.push({
            kind: "namespace",
            name: getName(node),
            line: getLine(node),
        });

        return;
    }
}

/* =========================================================
   Markdown Renderer
========================================================= */

function renderStructure(
    filePath: string,
    structure: Structure
): string {
    const lines: string[] = [];

    lines.push(`# AST — ${filePath}`);

    /* -------------------------------------------------------
       Imports
    ------------------------------------------------------- */

    if (structure.imports.length > 0) {
        lines.push("");
        lines.push("## Imports");

        for (const imp of structure.imports) {
            const specs =
                imp.specifiers.length > 0
                    ? imp.specifiers.join(", ")
                    : "*";

            lines.push(
                `- from '${imp.source}': ${specs} — line ${imp.line}`
            );
        }
    }

    /* -------------------------------------------------------
       Functions
    ------------------------------------------------------- */

    if (structure.functions.length > 0) {
        lines.push("");
        lines.push("## Functions");

        for (const fn of structure.functions) {
            const flags = [
                fn.async ? "async" : "",
                fn.generator ? "generator" : "",
                fn.exported ? "export" : "",
            ]
                .filter(Boolean)
                .join(" ");

            const params = fn.params.join(", ");

            const returnType = fn.returnType
                ? ` → ${fn.returnType}`
                : "";

            const meta = flags
                ? ` [${flags}]`
                : "";

            lines.push(
                `- ${fn.name}(${params})${returnType}${meta} — line ${fn.line}`
            );
        }
    }

    /* -------------------------------------------------------
       Classes
    ------------------------------------------------------- */

    if (structure.classes.length > 0) {
        lines.push("");
        lines.push("## Classes");

        for (const cls of structure.classes) {
            const extendsPart = cls.superClass
                ? ` extends ${cls.superClass}`
                : "";

            const exportPart = cls.exported
                ? " [export]"
                : "";

            lines.push(
                `- ${cls.name}${extendsPart}${exportPart} — line ${cls.line}`
            );

            for (const method of cls.methods) {
                const flags = [
                    method.static ? "static" : "",
                    method.abstract ? "abstract" : "",
                    method.access && method.access !== "public"
                        ? method.access
                        : "",
                ]
                    .filter(Boolean)
                    .join(" ");

                const flagText = flags
                    ? ` ${flags}`
                    : "";

                lines.push(
                    `  - [${method.kind}]${flagText} ${method.name}`
                );
            }
        }
    }

    /* -------------------------------------------------------
       Types / Interfaces / Enums
    ------------------------------------------------------- */

    if (structure.types.length > 0) {
        lines.push("");
        lines.push("## Types / Interfaces / Enums");

        for (const type of structure.types) {
            lines.push(
                `- [${type.kind}] ${type.name} — line ${type.line}`
            );

            if (type.members?.length) {
                for (const member of type.members) {
                    const cleanMember = member
                        .replace(/\s+/g, " ")
                        .trim();

                    if (cleanMember) {
                        lines.push(`  - ${cleanMember}`);
                    }
                }
            }
        }
    }

    /* -------------------------------------------------------
       Top-level variables
    ------------------------------------------------------- */

    if (structure.variables.length > 0) {
        lines.push("");
        lines.push("## Top-level Variables");

        for (const variable of structure.variables) {
            const exportPart = variable.exported
                ? " [export]"
                : "";

            lines.push(
                `- ${variable.kind} ${variable.name}${exportPart} — line ${variable.line}`
            );
        }
    }

    /* -------------------------------------------------------
       Exports
    ------------------------------------------------------- */

    if (structure.exports.length > 0) {
        lines.push("");
        lines.push("## Exports");

        lines.push(
            `- ${structure.exports.join(", ")}`
        );
    }

    return lines.join("\n");
}

/* =========================================================
   Parser Configuration
========================================================= */

function parseCode(source: string, extension: string) {
  const isTypeScript =
    extension === ".ts" ||
    extension === ".tsx";

  const isJSX =
    extension === ".jsx" ||
    extension === ".tsx";

  return parse(source, {
    sourceType: "unambiguous",

    allowAwaitOutsideFunction: true,
    allowReturnOutsideFunction: true,
    errorRecovery: false,

    plugins: [
      ...(isTypeScript ? ["typescript" as const] : []),
      ...(isJSX ? ["jsx" as const] : []),

      // Needed only if the project uses legacy decorators.
      "decorators-legacy",
    ],
  });
}

/* =========================================================
   AST Analyze Tool
========================================================= */

export const astAnalyzeTool = tool(
    async ({ file_path }) => {
        try {
            /* -----------------------------------------------------
               Resolve path safely
            ----------------------------------------------------- */

            const fullPath = safePath(file_path);

            /* -----------------------------------------------------
               Read source file
            ----------------------------------------------------- */

            const content = await fs.readFile(
                fullPath,
                "utf-8"
            );

            const extension = path
                .extname(file_path)
                .toLowerCase();

            const supportedExtensions = [
                ".js",
                ".jsx",
                ".ts",
                ".tsx",
                ".mjs",
                ".cjs",
            ];

            if (!supportedExtensions.includes(extension)) {
                return (
                    `❌ Unsupported file type: ${extension}\n` +
                    `Supported: ${supportedExtensions.join(", ")}`
                );
            }

            /* -----------------------------------------------------
               Parse
            ----------------------------------------------------- */

            const ast = parseCode(
                content,
                extension
            );

            /* -----------------------------------------------------
               Extract
            ----------------------------------------------------- */

            const structure = extractStructure(
                ast,
                content
            );

            /* -----------------------------------------------------
               Render compact representation
            ----------------------------------------------------- */

            return renderStructure(
                file_path,
                structure
            );
        } catch (error: any) {
            const message =
                error instanceof Error
                    ? error.message
                    : String(error);

            return `❌ AST parse error for ${file_path}: ${message}`;
        }
    },

    {
        name: "ast_analyze",

        description:
            "Parse a JS/TS/JSX/TSX file with Babel and extract its code structure: " +
            "imports, exports, functions with parameters/async/generator/return type, " +
            "classes with methods, TypeScript interfaces/types/enums, and top-level variables. " +
            "Use this instead of reading the full file when you want to understand what a file contains.",

        schema: z.object({
            file_path: z
                .string()
                .describe(
                    "Path to the JS/TS/JSX/TSX file relative to the working directory"
                ),
        }),
    }
);