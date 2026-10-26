import { createConfig, HCAIRequestor, HCAITooling } from "hackclubai-ts";
import { NextRequest, NextResponse } from "next/server";

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL!;
const INLINE_LIMIT = 900; // per block, keeps the whole message under Discord's 2000 char cap

async function logToDiscord(entry: {
    route: string;
    method: string;
    status: number;
    request?: unknown;
    response?: unknown;
}) {
    if (!DISCORD_WEBHOOK_URL) return;

    try {
        const form = new FormData();
        const attachments: { id: number; filename: string }[] = [];
        let content = `**${entry.method}** \`${entry.route}\` → **${entry.status}**`;
        let fileIndex = 0;

        const addBlock = (label: string, data: unknown, filename: string) => {
            if (data === undefined) return;
            const json = JSON.stringify(data, null, 2) ?? "undefined";

            if (json.length <= INLINE_LIMIT) {
                content += `\n**${label}:**\n\`\`\`json\n${json}\n\`\`\``;
            } else {
                attachments.push({ id: fileIndex, filename });
                form.append(
                    `files[${fileIndex}]`,
                    new Blob([json], { type: "application/json" }),
                    filename
                );
                content += `\n**${label}:** attached as \`${filename}\``;
                fileIndex++;
            }
        };

        addBlock("Request", entry.request, "request.json");
        addBlock("Response", entry.response, "response.json");

        form.append(
            "payload_json",
            JSON.stringify({ content, ...(attachments.length && { attachments }) })
        );

        await fetch(DISCORD_WEBHOOK_URL, { method: "POST", body: form });
    } catch (err) {
        console.error("Discord logging failed:", err);
    }
}

export async function POST(req: NextRequest) {
    if (!req.headers.get("x-hcai-api-key")) {
        return NextResponse.json({ error: "Missing HackClubAI API key in headers." }, { status: 400 });
    }

    let route = "unknown";
    let method = "POST";
    let sendBody: unknown;

    try {
        const apiKey = req.headers.get("x-hcai-api-key") || "";

        const config = createConfig(apiKey);
        const requestor = new HCAIRequestor(config);

        const body = await req.json();
        ({ route, method = "POST", body: sendBody } = body);

        if (method !== "POST") {
            const response = await fetch(config.BASE_URL + route, {
                method: method,
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${apiKey}`
                }
            });
            const data = await response.json();
            await logToDiscord({ route, method, status: response.status, request: sendBody, response: data });
            return NextResponse.json(data);
        }

        const response = await requestor.request(route, sendBody);
        await logToDiscord({ route, method, status: 200, request: sendBody, response });
        return NextResponse.json(response);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await logToDiscord({ route, method, status: 500, request: sendBody, response: { error: message } });
        return NextResponse.json({ error: "Internal server error.", message }, { status: 500 });
    }
}
