import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getFileContent } from "@/app/(main)/lib/githubClient";
import { verifyWizard } from "@/app/(main)/lib/verifyWizard";

const genAI = new GoogleGenerativeAI(process.env.GENAI_API_KEY!);

const LANDING_PAGE_PATH = "src/app/(main)/page.tsx";

const SYSTEM_PROMPT = `You are an expert React/Next.js developer. You will be given the current source code of a landing page component (a .tsx file) and a user instruction describing what to change.

Do NOT output the full file. Do NOT output a JSON format. JSON strings require too much escaping and easily break.

Instead, output a sequence of text replacements in the exact custom text format below.

Format each replacement block exactly like this:
<<<<< SEARCH
exact lines to find and replace
=====
new lines to replace them with
>>>>>

Rules:
1. "SEARCH" lines must EXACTLY match a contiguous block of text from the source code, including spaces, tabs, and line breaks. Copy it exactly as it appears.
2. Be EXTREMELY conservative. Only change EXACTLY what the user asks for. Do NOT touch anything else.
3. Be EXTREMELY accurate. Provide enough context lines in your "SEARCH" block to uniquely target the area in the file. (Usually 3-4 lines is enough context).
4. Do NOT output markdown ticks \`\`\` around your output.
5. If changing colors, just target the class strings.
6. Only output your search/replace blocks. No other text.`;

export async function POST(request: NextRequest) {
  const auth = await verifyWizard(request);
  if (auth.error) return auth.error;

  try {
    const { prompt } = await request.json();

    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json(
        { error: "prompt is required" },
        { status: 400 },
      );
    }

    // Fetch the current file from GitHub main branch
    const file = await getFileContent(LANDING_PAGE_PATH, "main");

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const result = await model.generateContent([
      { text: SYSTEM_PROMPT },
      {
        text: `Here is the current source code of the landing page:\n\n${file.content}`,
      },
      {
        text: `User instruction: ${prompt}`,
      },
    ]);

    const rawResponse = result.response.text();

    console.log("Raw AI response:");
    console.log(rawResponse);

    // Parse the custom <<<<< SEARCH format
    const changeRegex = /<<<<< SEARCH\n([\s\S]*?)\n=====\n([\s\S]*?)\n>>>>>/g;
    const changes: Array<{ find: string; replace: string }> = [];

    let match;
    while ((match = changeRegex.exec(rawResponse)) !== null) {
      if (match[1] && typeof match[2] === "string") {
        changes.push({
          find: match[1], // exact whitespace is needed
          replace: match[2],
        });
      }
    }

    if (changes.length === 0) {
      return NextResponse.json(
        { error: "AI couldn't format the response properly or found no matches to change." },
        { status: 400 },
      );
    }

    // Apply the changes to the original file
    let modifiedTsx = file.content;
    let appliedCount = 0;

    for (const change of changes) {
      if (modifiedTsx.includes(change.find)) {
        // String replace only replaces the first instance it finds
        modifiedTsx = modifiedTsx.replace(change.find, change.replace);
        appliedCount++;
      } else {
        console.warn("Could not find exact text match to replace:\n", JSON.stringify(change.find));
        // let's try a fallback: trim both and try
        const fallbackFind = change.find.trim();
        if (modifiedTsx.includes(fallbackFind)) {
          modifiedTsx = modifiedTsx.replace(fallbackFind, change.replace.trim());
          appliedCount++;
        }
      }
    }

    if (appliedCount === 0) {
      return NextResponse.json(
        { error: "AI generated changes but they did not match the source file exactly. Please try again or provide smaller context." },
        { status: 500 },
      );
    }

    return NextResponse.json({
      modifiedContent: modifiedTsx,
      changes: changes,
      originalSha: file.sha,
    });
  } catch (error) {
    console.error("Landing page AI generate error:", error);
    return NextResponse.json(
      {
        error: "Failed to generate content",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
