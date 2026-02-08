import type { ServerResponse } from "http";

export class SSEManager {
    private clients: Set<ServerResponse> = new Set();

    addClient(res: ServerResponse): void {
        res.writeHead(200, {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
        });
        res.write("\n");
        this.clients.add(res);

        res.on("close", () => {
            this.clients.delete(res);
        });
    }

    removeClient(res: ServerResponse): void {
        this.clients.delete(res);
    }

    broadcast(event: string, data: any): void {
        const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        for (const client of this.clients) {
            client.write(payload);
        }
    }

    get clientCount(): number {
        return this.clients.size;
    }
}
