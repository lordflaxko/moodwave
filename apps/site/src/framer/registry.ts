import type { ComponentType } from "react"
import AccountChip from "../components/AccountChip.tsx"
import Composer from "../components/Composer.tsx"
import ContextMoods from "../components/ContextMoods.tsx"
import Cursor from "../components/Cursor.tsx"
import EnergyMixer from "../components/EnergyMixer.tsx"
import ErrorsView from "../components/ErrorsView.tsx"
import FeaturedPlaylists from "../components/FeaturedPlaylists.tsx"
import FlowStory from "../components/FlowStory.tsx"
import Grain from "../components/Grain.tsx"
import Library from "../components/Library.tsx"
import MiniEq from "../components/MiniEq.tsx"
import MobileMenu from "../components/MobileMenu.tsx"
import PlaylistView from "../components/PlaylistView.tsx"
import Preloader from "../components/Preloader.tsx"
import RecentPrompts from "../components/RecentPrompts.tsx"
import RecordSleeve from "../components/RecordSleeve.tsx"
import SharedPlaylist from "../components/SharedPlaylist.tsx"
import SpinRecord from "../components/SpinRecord.tsx"
import Spotlight from "../components/Spotlight.tsx"
import Studio from "../components/Studio.tsx"
import TrackPlay from "../components/TrackPlay.tsx"
import Waveform from "../components/Waveform.tsx"
import * as Overrides from "../components/Overrides.tsx"

/** Code components by their Framer display name. */
export const COMPONENTS: Record<string, ComponentType<any>> = {
    AccountChip, Composer, ContextMoods, Cursor, EnergyMixer, ErrorsView, FeaturedPlaylists, FlowStory, Grain, Library,
    MiniEq, MobileMenu, PlaylistView, Preloader, RecentPrompts, RecordSleeve, SharedPlaylist, SpinRecord, Spotlight,
    Studio, TrackPlay, Waveform,
}

export const OVERRIDES = Overrides as unknown as Record<string, (c: ComponentType<any>) => ComponentType<any>>
