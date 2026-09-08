export function Icon({
    kind,
}: {
    kind:
        | "files"
        | "chat"
        | "tasks"
        | "history"
        | "settings"
        | "refresh"
        | "close"
        | "send"
        | "copy";
}) {
    const paths: Record<string, string> = {
        files: "M5 3h9l5 5v13H5z M14 3v6h5 M8 13h8 M8 17h6",
        chat: "M3 4h18v13H8l-5 4z",
        tasks: "m3 6 2 2 4-4 M12 6h9 m-18 7 2 2 4-4 M12 13h9 M5 20h2 M12 20h9",
        history: "M4 9a8 8 0 1 1 0 7 M4 3v6h6 M12 7v6l4 2",
        settings: "M4 6h16 M4 12h16 M4 18h16 M8 3v6 M16 9v6 M10 15v6",
        refresh:
            "M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15",
        close: "M18 6L6 18M6 6l12 12",
        send: "M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z",
        copy: "M8 4v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7.242a2 2 0 0 0-.602-1.43L16.083 2.57A2 2 0 0 0 14.685 2H10a2 2 0 0 0-2 2z M4 8H2v12a2 2 0 0 0 2 2h12v-2",
    };
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d={paths[kind]} />
        </svg>
    );
}
