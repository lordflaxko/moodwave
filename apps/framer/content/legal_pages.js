// Builds /faq, /privacy and /terms as native Framer text (editable in the canvas).
// Content rules for the DSL: no straight double quotes and no semicolons inside text.
const ISSUES = "https://github.com/lordflaxko/moodwave/issues"
const UPDATED = "Last updated October 10, 2026"

const PAGES = [
    {
        key: "faq",
        path: "/faq",
        name: "FAQ",
        title: "FAQ · Moodwave",
        description: "Answers about Moodwave: real songs, guest mode, Spotify sign-in, saving, sharing and your data.",
        intro: { eyebrow: "Help", h1: "Questions, answered.", lead: "The short version of how Moodwave works, what it can do, and what it can’t (yet)." },
        sections: [
            ["What is Moodwave?", ["Describe a moment, a feeling or a place in your own words. Moodwave’s AI reads the mood, plans the arc of a playlist and picks songs to match, then you can play it, tweak it and save it to Spotify."]],
            ["Are the songs real?", ["Yes. Every pick is searched for on Spotify and only kept if it matches a real track, so nothing is invented. Songs that can’t be verified are swapped for ones that can."]],
            ["Do I need a Spotify account?", ["No. Choose “Try it as a guest” to make playlists with the real catalogue and the full AI. Guests can make up to 5 playlists a day, up to 30 songs each, and can’t save to Spotify. If you later sign in with Spotify, your guest playlists come with you."]],
            ["Why can’t I sign in with Spotify?", ["Spotify keeps new apps in development mode, which only lets a short list of invited accounts sign in. If yours isn’t on it you’ll see an invite-only message, and you can still use Moodwave as a guest."]],
            ["How long can a playlist be?", ["Anywhere from 15 to 100 songs when signed in with Spotify, and up to 30 as a guest. Asking for one artist (“Don Toliver night songs”) keeps it to that artist and their features, and tops up with clearly tagged similar artists if they run out of fitting songs."]],
            ["Why do some songs only play for 30 seconds?", ["Playback uses Spotify’s own player. If you’re logged in to Spotify in the same browser you hear full tracks, otherwise Spotify plays a 30-second preview."]],
            ["Can I change a playlist after it’s made?", ["Yes. Reorder, swap or remove songs, rename it, change the cover, or ask for changes in plain words (“make it more upbeat”). If it’s already on Spotify, use “Update on Spotify” to copy your edits across."]],
            ["Does it learn what I like?", ["Thumbs up and down on songs steer future playlists: liked songs nudge the feel, disliked songs are avoided, and an artist you dislike twice is left out. Signed-in listeners can also turn on “Blend my taste” to lightly mix in their top Spotify artists."]],
            ["How do sharing links work?", ["“Share” makes a link anyone can open to see and play the playlist, without signing in. They can’t edit it. Turning the link off stops it working everywhere."]],
            ["How do I delete my data?", ["Open the account menu and choose “Delete my account and data”. It removes your playlists, covers, share links and thumbs straight away. Playlists you saved to Spotify stay in Spotify."]],
            ["Is Moodwave free?", ["Yes. It’s a personal project, with no ads and nothing to buy."]],
        ],
        contact: "Something else? Open an issue on GitHub →",
    },
    {
        key: "privacy",
        path: "/privacy",
        name: "Privacy",
        title: "Privacy · Moodwave",
        description: "What Moodwave stores, who it shares it with, and how to delete it.",
        intro: { eyebrow: "Privacy", h1: "Your data, plainly.", lead: "Moodwave keeps only what it needs to make and remember your playlists. No ads, no selling data, no tracking you around the web." },
        sections: [
            ["What we store", [
                "If you sign in with Spotify: your Spotify user ID, display name, email address and profile picture, plus Spotify access tokens, which are encrypted and only used to make and update playlists for you.",
                "Your playlists: the prompts you write, the songs, any changes you ask for, cover choices and images you upload, and share links you turn on.",
                "Your thumbs up and down on songs, used to steer future playlists.",
                "If you use guest mode: the same playlist data, linked to an anonymous guest account rather than a Spotify one.",
                "Error reports: if something breaks, the page, the error message and technical details, your browser type and, if you’re signed in, your account ID. Only the most recent errors are kept.",
            ]],
            ["What we don’t collect", ["No advertising or cross-site tracking. Your IP address is used briefly to limit how often someone can start guest sessions and send error reports, and isn’t saved with your account. Like any website, our hosting providers may keep standard server logs."]],
            ["Who sees what", [
                "Spotify: to sign you in, search the catalogue, read your top artists when you turn on “Blend my taste”, and save playlists to your account.",
                "Anthropic (the AI): your prompt, the playlist’s mood and song list, change requests, and the titles and artists of songs you’ve liked or disliked, so it can plan and refine playlists. It’s used under Anthropic’s commercial API terms.",
                "Render (runs the Moodwave server), Neon (stores the database) and Framer (hosts this website).",
                "If you turn on “Use my weather”: your approximate location, rounded to about a kilometre, goes straight from your browser to Open-Meteo for the weather and BigDataCloud for the town name. It isn’t sent to or stored by Moodwave.",
                "Anyone with a share link you create can see that playlist, its prompt and your first name.",
            ]],
            ["On your device", ["Moodwave stores a sign-in token in your browser’s local storage, plus a few preferences such as hidden prompt suggestions and the “Blend my taste” switch. There are no advertising cookies."]],
            ["How long we keep it", ["Until you delete it. Deleting a playlist removes it and its share link straight away, and deleting your account removes everything listed above (error reports are kept without the link to your account)."]],
            ["Your choices", [
                "Delete your account and all its data any time from the account menu: “Delete my account and data”.",
                "Remove Moodwave’s access to your Spotify account at spotify.com/account/apps. Playlists already saved to Spotify stay there until you delete them in Spotify.",
                "Weather and “Blend my taste” are off unless you turn them on.",
            ]],
            ["Children", ["Moodwave isn’t meant for children under 13 and doesn’t knowingly collect their data."]],
            ["Changes", ["If this policy changes, the date at the top changes too. Significant changes will be noted on the site."]],
        ],
        contact: "Questions about your data? Open an issue on GitHub → (please don’t post personal details there)",
    },
    {
        key: "terms",
        path: "/terms",
        name: "Terms",
        title: "Terms · Moodwave",
        description: "The terms for using Moodwave.",
        intro: { eyebrow: "Terms", h1: "The ground rules.", lead: "Moodwave is a free personal project. By using it you agree to these terms. They’re short, so please read them." },
        sections: [
            ["Using Moodwave", ["You can use Moodwave to make, edit, play and share playlists for your own personal, non-commercial enjoyment. Don’t try to break, overload or misuse the service, get around its limits, or use it to do anything unlawful."]],
            ["Spotify", ["Moodwave uses Spotify to sign you in, find songs, play them and save playlists, and you also have to follow Spotify’s own terms. Moodwave isn’t affiliated with, endorsed by or sponsored by Spotify. Music, artwork and artist images belong to their owners."]],
            ["What you add", ["You’re responsible for the prompts you write and the images you upload. Only upload images you have the right to use, and nothing illegal, hateful or explicit. Moodwave may remove content or turn off share links that break these rules."]],
            ["AI results", ["Playlists are made by an AI and checked against Spotify, but descriptions and reasons can still be wrong or not to your taste. Treat them as suggestions."]],
            ["Limits and availability", ["Guest mode and some features have daily limits. Moodwave is provided as is, without any guarantee it will always be available, fast or error-free, and features may change or stop. To the extent the law allows, Moodwave isn’t liable for losses arising from using it."]],
            ["Ending things", ["You can stop using Moodwave and delete your account and data at any time from the account menu. Access may be suspended for anyone who misuses the service."]],
            ["Changes", ["These terms may be updated. The date at the top shows the latest version, and continuing to use Moodwave means you accept it."]],
        ],
        contact: "Questions about these terms? Open an issue on GitHub →",
    },
]

const clean = (s) => {
    if (/["";]/.test(s.replace(/[“”]/g, ""))) throw new Error("Unsafe character in: " + s.slice(0, 60))
    return s
}

state.legal = state.legal || {}
for (const p of PAGES) {
    if (state.legal[p.key]) {
        console.log(p.key, "already built:", state.legal[p.key])
        continue
    }
    const k = p.key
    const lines = []
    lines.push(`+WebPageNode ${k}-page name="${p.name}" path="${p.path}" layoutTemplate="QtLlPOj3b" metadata.title="${clean(p.title)}" metadata.description="${clean(p.description)}";`)
    lines.push(`+FrameNode ${k}-root parent="${k}-page" name="Desktop" width="1200px" height="auto";`)
    lines.push(`+FrameNode ${k}-main parent="${k}-root" name="${p.name}" htmlTag="main" layout="stack" stackDirection="vertical" stackDistribution="start" stackAlignment="center" gap="0px" padding="168px 40px 140px 40px" position="relative" width="100%" height="auto" minHeight="100vh";`)
    lines.push(`+FrameNode ${k}-col parent="${k}-main" name="Content" layout="stack" stackDirection="vertical" stackDistribution="start" stackAlignment="start" gap="48px" position="relative" width="100%" height="auto" maxWidth="720px";`)
    lines.push(`+FrameNode ${k}-head parent="${k}-col" name="Intro" layout="stack" stackDirection="vertical" stackDistribution="start" stackAlignment="start" gap="16px" position="relative" width="100%" height="auto";`)
    lines.push(`+RichTextNode ${k}-eyebrow parent="${k}-head" text="${clean(p.intro.eyebrow)}" textStylePreset="Eyebrow" textColor="var(--token-cec447b5-ff9a-49c9-9e67-b497943cd039)" width="auto" height="auto";`)
    lines.push(`+RichTextNode ${k}-h1 parent="${k}-head" text="${clean(p.intro.h1)}" textStylePreset="Display L" width="100%" height="auto";`)
    lines.push(`+RichTextNode ${k}-lead parent="${k}-head" text="${clean(p.intro.lead)}" textStylePreset="Lead" textColor="var(--token-89712b57-0c49-4d6b-a756-5b3a10364b09)" width="100%" height="auto";`)
    if (p.key !== "faq") lines.push(`+RichTextNode ${k}-updated parent="${k}-head" text="${UPDATED}" textStylePreset="Eyebrow" textColor="var(--token-6c8cca14-46ce-4d02-91df-91c898febe61)" width="auto" height="auto";`)
    p.sections.forEach(([heading, paras], i) => {
        const s = `${k}-s${i}`
        lines.push(`+FrameNode ${s} parent="${k}-col" name="${clean(heading).replace(/[“”]/g, "")}" layout="stack" stackDirection="vertical" stackDistribution="start" stackAlignment="start" gap="12px" position="relative" width="100%" height="auto" padding="28px 0px 0px 0px" border="1px solid var(--token-17423f49-e7f7-4836-92e6-01e876b9cee1)" borderTopWidth="1px" borderRightWidth="0px" borderBottomWidth="0px" borderLeftWidth="0px";`)
        lines.push(`+RichTextNode ${s}-h parent="${s}" text="${clean(heading)}" textStylePreset="Display M" width="100%" height="auto";`)
        paras.forEach((para, j) => {
            const bullet = paras.length > 1
            lines.push(`+RichTextNode ${s}-p${j} parent="${s}" text="${clean((bullet ? "•  " : "") + para)}" textStylePreset="Body" textColor="var(--token-89712b57-0c49-4d6b-a756-5b3a10364b09)" width="100%" height="auto";`)
        })
    })
    lines.push(`+RichTextNode ${k}-contact parent="${k}-col" text="${clean(p.contact)}" textStylePreset="Body" textColor="var(--token-ccb7e575-c828-4a58-b5ed-986a9fe43216)" link="${ISSUES}" width="100%" height="auto";`)
    const r = await framer.agent.applyChanges(lines.join("\n"), {})
    const ids = r.renamedIds || {}
    state.legal[k] = { page: ids[`${k}-page`], root: ids[`${k}-root`], main: ids[`${k}-main`] }
    console.log(k, r.message, JSON.stringify(state.legal[k]))
}
