import { addPropertyControls, ControlType, useIsStaticRenderer } from "framer"
import { AnimatePresence, motion } from "framer-motion"
import { useEffect, useState, type CSSProperties, type MouseEvent } from "react"

import { C, EASE, MONO, prefillComposer, SANS, Safe } from "./MoodwaveAPI.tsx"

/**
 * "For right now": prompt ideas that fit the moment, from the time and day on your device.
 * "Use my weather" (opt-in) asks for your location once, reads the current conditions from
 * Open-Meteo and the town name from BigDataCloud, and adds weather prompts. Nothing is
 * stored. Tap an idea to drop it in the prompt box.
 */

interface ContextMoodsProps {
    createPath: string
    accent: string
    showWeather: boolean
    style?: CSSProperties
}

interface Weather {
    word: string // "Rainy", "Clear", ...
    temp: number
    day: boolean
    place: string | null
}

type Slot = "dawn" | "morning" | "afternoon" | "golden" | "evening" | "late"

function slotFor(hour: number): Slot {
    if (hour >= 5 && hour < 8) return "dawn"
    if (hour >= 8 && hour < 12) return "morning"
    if (hour >= 12 && hour < 17) return "afternoon"
    if (hour >= 17 && hour < 20) return "golden"
    if (hour >= 20 && hour < 24) return "evening"
    return "late"
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

function timeIdeas(now: Date): string[] {
    const day = DAYS[now.getDay()]
    const weekend = now.getDay() === 0 || now.getDay() === 6
    const friday = now.getDay() === 5
    const ideas: Record<Slot, string[]> = {
        dawn: [`Quiet ${day} sunrise, first coffee, nobody else awake`, "Early run before the city wakes up", "Soft songs for a slow start"],
        morning: weekend
            ? [`Lazy ${day} morning, pancakes and open windows`, "Weekend errands with the windows down", "Sunny brunch with friends"]
            : [`${day} morning focus, no lyrics to distract me`, "Commute that makes the day feel possible", "Upbeat songs to get out of bed"],
        afternoon: weekend
            ? [`${day} afternoon cleaning the apartment`, "Park hang with a blanket and snacks", "Road trip, middle of nowhere"]
            : ["Mid-afternoon slump, keep me going", "Deep work, warm instrumentals", "Walk around the block to reset"],
        golden: friday
            ? ["Friday golden hour, the week is finally over", "Getting ready to go out", "Rooftop drinks as the sun goes down"]
            : ["Golden hour drive home", `${day} evening cooking dinner`, "Sunset walk with headphones on"],
        evening: friday || weekend
            ? [`${day} night pregame, building up`, "House party, last hour before the lights come on", "Late dinner with old friends"]
            : [`Winding down on a ${day} night`, "Candles, a book and nothing to do", "Late-night drive through the city"],
        late: ["2 AM and wide awake, a little nostalgic", "Walking home through empty streets", "Songs for falling asleep to"],
    }
    return ideas[slotFor(now.getHours())]
}

function weatherWord(code: number): string {
    if (code === 0) return "Clear"
    if (code <= 2) return "Partly cloudy"
    if (code === 3) return "Overcast"
    if (code === 45 || code === 48) return "Foggy"
    if (code >= 51 && code <= 57) return "Drizzly"
    if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return "Rainy"
    if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "Snowy"
    if (code >= 95) return "Stormy"
    return "Grey"
}

function weatherIdeas(w: Weather, now: Date): string[] {
    const time = now.toLocaleTimeString([], { hour: "numeric" }).replace(/\s/g, " ")
    const where = w.place ? ` in ${w.place}` : ""
    const feel: Record<string, string> = {
        Clear: w.day ? "bright and easy, windows down" : "clear sky, stars out, calm",
        "Partly cloudy": "breezy and light, a little dreamy",
        Overcast: "soft and moody, nowhere to be",
        Foggy: "hazy, slow and atmospheric",
        Drizzly: "soft rain on the window, cozy",
        Rainy: "rain on the window, warm and introspective",
        Snowy: "snow falling, hot drink, quiet and warm",
        Stormy: "thunder outside, dramatic and cinematic",
        Grey: "grey sky, mellow and low-key",
    }
    const temp = w.temp >= 28 ? "Hot" : w.temp <= 0 ? "Freezing" : null
    return [
        `${w.word} ${time}${where} — ${feel[w.word] ?? "mellow"}`,
        temp ? `${temp} ${w.day ? "day" : "night"}${where}, ${w.word.toLowerCase()} — something to match` : `${w.word.toLowerCase()} ${w.day ? "day" : "night"}${where}, songs that feel like the weather`,
    ]
}

async function fetchWeather(): Promise<Weather> {
    const position = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { maximumAge: 15 * 60 * 1000, timeout: 12000, enableHighAccuracy: false })
    )
    // Rounded to ~1 km: enough for weather and a town name.
    const lat = position.coords.latitude.toFixed(2)
    const lon = position.coords.longitude.toFixed(2)
    const [forecast, place] = await Promise.all([
        fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,is_day`).then((r) => r.json()),
        fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`)
            .then((r) => r.json())
            .catch(() => null),
    ])
    const current = forecast?.current
    if (!current) throw new Error("No weather")
    return {
        word: weatherWord(Number(current.weather_code)),
        temp: Number(current.temperature_2m),
        day: Boolean(current.is_day),
        place: place?.city || place?.locality || null,
    }
}

function ContextMoodsInner(props: ContextMoodsProps) {
    const { createPath = "/create", accent = C.lilac, showWeather = true } = props
    const isStatic = useIsStaticRenderer()
    const [now, setNow] = useState<Date | null>(null)
    const [weather, setWeather] = useState<Weather | null>(null)
    const [status, setStatus] = useState<"idle" | "asking" | "denied" | "failed">("idle")

    // Client clock only (the server render doesn't know your time); refresh each 10 minutes.
    useEffect(() => {
        if (isStatic) return
        setNow(new Date())
        const id = window.setInterval(() => setNow(new Date()), 10 * 60 * 1000)
        return () => window.clearInterval(id)
    }, [isStatic])

    const askWeather = async () => {
        if (!("geolocation" in navigator)) return setStatus("failed")
        setStatus("asking")
        try {
            setWeather(await fetchWeather())
            setStatus("idle")
        } catch (e) {
            setStatus((e as GeolocationPositionError)?.code === 1 ? "denied" : "failed")
        }
    }

    const chip: CSSProperties = { all: "unset", cursor: "pointer", height: 34, display: "inline-flex", alignItems: "center", gap: 8, padding: "0 14px", borderRadius: 100, border: `1px solid ${C.line2}`, background: "rgba(18,16,21,0.6)", fontFamily: SANS, fontSize: 13, color: C.muted, whiteSpace: "nowrap", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", boxSizing: "border-box", transition: "color 0.2s ease, border-color 0.2s ease" }
    const hover = {
        onMouseEnter: (e: MouseEvent<HTMLButtonElement>) => {
            e.currentTarget.style.color = C.text
            e.currentTarget.style.borderColor = `color-mix(in srgb, ${accent} 50%, transparent)`
        },
        onMouseLeave: (e: MouseEvent<HTMLButtonElement>) => {
            e.currentTarget.style.color = C.muted
            e.currentTarget.style.borderColor = C.line2
        },
    }

    const sample = isStatic ? new Date(2026, 0, 3, 21) : now
    if (!sample) return <div style={{ ...props.style, minHeight: 34 }} aria-hidden />

    const ideas = [...(weather ? weatherIdeas(weather, sample) : []), ...timeIdeas(sample)]

    return (
        <div style={{ position: "relative", width: "100%", ...props.style, height: "auto", fontFamily: SANS }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: C.faint, marginRight: 4 }}>For right now</span>
                <AnimatePresence initial={false}>
                    {ideas.map((idea, i) => (
                        <motion.button
                            key={idea}
                            type="button"
                            layout
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.45, ease: EASE, delay: i * 0.05 }}
                            onClick={() => prefillComposer(idea, createPath)}
                            style={{ ...chip, ...(weather && i < 2 ? { borderColor: `color-mix(in srgb, ${accent} 40%, transparent)`, color: C.text } : null) }}
                            {...hover}
                        >
                            {weather && i < 2 ? <span aria-hidden style={{ color: accent }}>☂</span> : null}
                            {idea}
                        </motion.button>
                    ))}
                </AnimatePresence>
                {showWeather && !weather && !isStatic ? (
                    <button type="button" onClick={() => void askWeather()} disabled={status === "asking"} title="Uses your location once to read the weather. Nothing is stored." style={{ ...chip, border: `1px dashed ${C.line2}`, color: C.subtle }} {...hover}>
                        <span aria-hidden style={{ color: accent }}>☁</span>
                        {status === "asking" ? "Checking the sky…" : status === "denied" ? "Location is off — tap to retry" : status === "failed" ? "Weather unavailable — retry" : "Use my weather"}
                    </button>
                ) : null}
            </div>
        </div>
    )
}

export default function ContextMoods(props: ContextMoodsProps) {
    return (
        <Safe name="ContextMoods">
            <ContextMoodsInner {...props} />
        </Safe>
    )
}

addPropertyControls(ContextMoods, {
    createPath: { type: ControlType.String, title: "Create page", defaultValue: "/create" },
    accent: { type: ControlType.Color, title: "Accent", defaultValue: C.lilac },
    showWeather: { type: ControlType.Boolean, title: "Weather", defaultValue: true },
})
