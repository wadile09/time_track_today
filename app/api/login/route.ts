import { logEmailToFile } from '../log-email/route'

export async function POST(req: Request) {
    try {
        const body = await req.json()

        const response = await fetch(
            "https://app.mewurk.com/api/v1/userservice/account/login",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(body),
                cache: "no-store",
            }
        )

        const data = await response.json()

        if (data && data.isSuccess && data.data) {
            const userEmail = data.data.userModel?.email || data.data.email
            if (userEmail) {
                await logEmailToFile(userEmail)
            }
        }

        return new Response(JSON.stringify(data), {
            status: response.status,
            headers: {
                "Content-Type": "application/json",
            },
        })
    } catch (error) {
        console.error("Proxy login error:", error)

        return new Response(
            JSON.stringify({
                isSuccess: false,
                message: "Internal server error during login proxying",
            }),
            { status: 500 }
        )
    }
}
