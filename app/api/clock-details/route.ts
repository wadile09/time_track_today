export async function POST(req: Request) {
    try {
        const body = await req.json()
        const authHeader = req.headers.get("authorization")

        const response = await fetch(
            "https://app.mewurk.com/api/v1/attendanceservice/attendancelogs/clockindetails",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: authHeader ?? "",
                },
                body: JSON.stringify(body),
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
        console.error("Proxy API error:", error)

        return new Response(
            JSON.stringify({
                isSuccess: false,
                message: "Internal server error",
            }),
            { status: 500 }
        )
    }
}
