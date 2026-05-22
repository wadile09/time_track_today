export async function GET(req: Request) {
    try {
        const authHeader = req.headers.get("authorization")

        const response = await fetch(
            "https://app.mewurk.com/api/v1/leaveservice/dashboard/upcoming/events",
            {
                method: "GET",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: authHeader ?? "",
                },
                cache: "no-store",
            }
        )

        const data = await response.json()

        return new Response(JSON.stringify(data), {
            status: response.status,
            headers: {
                "Content-Type": "application/json",
            },
        })
    } catch (error) {
        console.error("Proxy upcoming-events error:", error)

        return new Response(
            JSON.stringify({
                isSuccess: false,
                message: "Internal server error during upcoming-events proxying",
            }),
            { status: 500 }
        )
    }
}
