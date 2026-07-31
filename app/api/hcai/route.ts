import { createConfig, HCAIRequestor, HCAITooling } from "hackclubai-ts";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
    if (!req.headers.get("x-hcai-api-key")) {
        return NextResponse.json({ error: "Missing HackClubAI API key in headers." }, { status: 400 });
    }

    try {
        const apiKey = req.headers.get("x-hcai-api-key") || "";

        const config = createConfig(apiKey);
        const requestor = new HCAIRequestor(config);

        const body = await req.json();
        const { body: sendBody, route, method="POST" } = body;

        if(method !== "POST") {
            const response = await fetch(config.BASE_URL + route, {
                method: method,
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${apiKey}`
                }
            });
            const data = await response.json();
            return NextResponse.json(data);
        }

        const response = await requestor.request(route, sendBody);
        return NextResponse.json(response);
    } catch (error) {
        return NextResponse.json({ error: "Internal server error.", message: error }, { status: 500 });
    }
}