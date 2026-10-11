/**
 * Stand-in for the "framer" package. The components came from Framer, where these APIs drive
 * the editor; on a normal site there is no editor, so controls are ignored and nothing is a
 * static canvas preview. Controls are kept so the page renderer can type and default the props
 * that Framer stored for each component instance.
 */
import type { ComponentType } from "react"

export const ControlType = {
    Boolean: "boolean",
    Number: "number",
    String: "string",
    Enum: "enum",
    Color: "color",
    Image: "image",
    ResponsiveImage: "responsiveimage",
    File: "file",
    Array: "array",
    Object: "object",
    Link: "link",
    Font: "font",
    Transition: "transition",
    EventHandler: "eventhandler",
    Slot: "slot",
    ComponentInstance: "componentinstance",
    Date: "date",
    BoxShadow: "boxshadow",
    Border: "border",
    Cursor: "cursor",
    Padding: "padding",
    BorderRadius: "borderradius",
    Gap: "gap",
} as const

type Controls = Record<string, { defaultValue?: unknown } & Record<string, unknown>>
const registry = new Map<unknown, Controls>()

/** Remembers each component's controls so default prop values can be read (see controlDefaults). */
export function addPropertyControls(component: ComponentType<never> | unknown, controls: Controls) {
    registry.set(component, controls)
}

export function getControls(component: unknown): Controls {
    return registry.get(component) ?? {}
}

export function controlDefaults(component: unknown): Record<string, unknown> {
    const controls = getControls(component)
    return Object.fromEntries(Object.entries(controls).filter(([, c]) => c.defaultValue !== undefined).map(([k, c]) => [k, c.defaultValue]))
}

export function useIsStaticRenderer(): boolean {
    return false
}
