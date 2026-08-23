"use client"

import { useMemo, useState } from "react"
import { useAuth } from "@/lib/auth-context"
import {
  useCommunityPosts,
  useCommunityScope,
  useLostFound,
  useEvents,
  createCommunityPost,
  togglePostLike,
  fetchPostComments,
  addPostComment,
  deletePostComment,
  pinPost,
  removePost,
  rsvpToEvent,
  createEvent,
  publishEvent,
  reportLostFound,
  resolveLostFound,
  attendancePercent,
  categoryClass,
  formatEventDate,
  lostFoundShareText,
  POST_CATEGORIES,
  type PostComment,
  type CommunityPost,
  type LostFoundItem,
  type CommunityEvent,
  type Species,
} from "@/lib/data"
import { toast } from "sonner"
import { IOSNavBar } from "@/components/ios-nav-bar"
import { NavBackButton } from "@/components/nav-back-button"
import {
  Heart,
  MessageCircle,
  Share2,
  MoreHorizontal,
  MapPin,
  Search,
  Plus,
  Clock,
  Dog,
  Cat,
  AlertTriangle,
  Megaphone,
  Pin,
  PinOff,
  Trash2,
  CheckCircle2,
  Users,
  CalendarDays,
  Loader2,
  Send,
  X,
  type LucideIcon,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import Image from "next/image"
import { Portal } from "@/components/ui/portal"

type FeedTab = "feed" | "lost" | "events"

/* `avatar` and `image` are "" or null when absent, and <Image src=""> renders a
 * broken image AND makes Next re-download the whole page. Both files exist in
 * public/. */
const AVATAR_FALLBACK = "/placeholder-user.jpg"
const PHOTO_FALLBACK = "/placeholder.jpg"

/**
 * PHASE 8 BUILT EVERY CONTROL PHASE 3 LEFT DISABLED HERE, plus the one it could
 * not see. (`docs/superpowers/plans/2026-08-22-phase-8-community.md`)
 *
 * Phase 3 found four `toast.success` calls asserting actions that had not
 * happened — "Post pinned", "Link copied", "RSVP confirmed", "More options —
 * coming soon" — and DISABLED them in place rather than deleting them, because
 * Phase 8 was written afterwards and said it would make them real. The comments
 * it left at each site recorded what each one used to claim and why it was a
 * lie; this header is where that history now lives, once, instead of five
 * times.
 *
 * What each of the five became, and what proves it:
 *
 *   Pin      -> `pinPost()`. Rendered only when the viewer MANAGES THIS
 *               BUILDING (`scope.via === "manager"`), not on `user?.role`,
 *               which is a claim about the account rather than about this feed.
 *               `community_posts_guard` (20260826000001) is what actually
 *               authorises it: before that migration `posts_update_own` let the
 *               AUTHOR pin their own post and set `is_official` on it.
 *   More     -> a real sheet with Remove, and nothing else. Not rendered at all
 *               when the viewer can do nothing to the post.
 *   Share    -> REMOVED from posts. There is no per-post route to copy: `/app`
 *               is one client-side screen switcher and `app/emergency/[code]`
 *               is the project's only dynamic route. Share is real on Lost &
 *               Found instead, as share TEXT — see `lostFoundShareText`, whose
 *               test is a security test.
 *   RSVP     -> `rsvpToEvent()`, toggling, with the live count AND the attendee
 *               names. `rsvps_read` (20260826000000) is what makes the count
 *               possible: the only policy on `event_rsvps` was
 *               `profile_id = auth.uid()`, so two RSVPs read as ONE, to the
 *               resident and to the manager alike.
 *   Search   -> a real client-side filter over the loaded list of whichever tab
 *               is open. It was a <span> styled as a text input: never typeable,
 *               no state, no handler, and invisible to both of Phase 3's sweep
 *               greps because it was neither a toast nor an onClick.
 *
 * `Unit {post.unit}` went with the field. It rendered "Unit  · 3h ago" for
 * every post, because `useCommunityPosts` passed the empty string; making it
 * real would have published a neighbour's ADDRESS on every post they wrote.
 */

function EmptyState({
  icon: Icon,
  title,
  subtext,
  cta,
  onCta,
}: {
  icon: LucideIcon
  title: string
  subtext: string
  cta?: string
  onCta?: () => void
}) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
        <Icon className="h-6 w-6 text-primary" />
      </div>
      <h3 className="mt-4 text-[15px] font-semibold text-foreground">{title}</h3>
      <p className="mx-auto mt-1 max-w-[20rem] text-[13px] leading-relaxed text-muted-foreground">{subtext}</p>
      {cta && onCta && (
        <button
          onClick={onCta}
          className="mt-3 rounded-xl bg-primary px-4 py-2 text-[13px] font-semibold text-primary-foreground"
        >
          {cta}
        </button>
      )}
    </div>
  )
}

/** One sheet shell, so every composer clears the fixed tab bar the same way. */
function Sheet({
  title,
  onClose,
  busy,
  children,
}: {
  title: string
  onClose: () => void
  busy?: boolean
  children: React.ReactNode
}) {
  return (
    <Portal>
      <div
        className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:px-6"
        onClick={() => !busy && onClose()}
      >
        {/* max-h + its own scroll: a composer taller than the viewport must
            scroll INSIDE the sheet, not push its buttons under the tab bar.
            pb-[max(1.25rem,env(safe-area-inset-bottom))] keeps the last control
            above the home indicator on a notched phone. */}
        <div
          className="flex max-h-[85vh] w-full max-w-sm flex-col rounded-t-2xl bg-card sm:rounded-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <h3 className="text-[17px] font-semibold text-foreground">{title}</h3>
            <button onClick={onClose} disabled={busy} className="p-1 disabled:opacity-50" aria-label="Close">
              <X className="h-5 w-5 text-muted-foreground" />
            </button>
          </div>
          <div className="ios-scroll flex-1 overflow-y-auto px-5 py-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
            {children}
          </div>
        </div>
      </div>
    </Portal>
  )
}

const FIELD =
  "mt-1 w-full rounded-xl border border-input bg-card px-3.5 py-2.5 text-[15px] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"

export function CommunityScreen({ onNavigate }: { onNavigate?: (screen: string) => void }) {
  const { user } = useAuth()
  const { data: scope } = useCommunityScope()
  /* Whether the viewer manages THIS FEED's building — not whether their account
   * has the manager role. A manager of another building reading this feed as a
   * resident is a resident here. */
  const managesThis = scope?.via === "manager"

  const { data: posts, isLoading: postsLoading, refetch: refetchPosts } = useCommunityPosts()
  const { data: lostFound, refetch: refetchLostFound } = useLostFound()
  const { data: events, refetch: refetchEvents } = useEvents()

  const [activeTab, setActiveTab] = useState<FeedTab>("feed")
  const [query, setQuery] = useState("")
  const [busyId, setBusyId] = useState<string | null>(null)

  const [composerOpen, setComposerOpen] = useState(false)
  const [composerContent, setComposerContent] = useState("")
  const [composerCategory, setComposerCategory] = useState("General")
  const [composerImage, setComposerImage] = useState<File | null>(null)
  const [posting, setPosting] = useState(false)

  const [commentsFor, setCommentsFor] = useState<string | null>(null)
  const [comments, setComments] = useState<PostComment[]>([])
  const [commentsLoading, setCommentsLoading] = useState(false)
  const [newComment, setNewComment] = useState("")
  const [commenting, setCommenting] = useState(false)

  const [menuFor, setMenuFor] = useState<CommunityPost | null>(null)

  const [lfOpen, setLfOpen] = useState(false)
  const [lfBusy, setLfBusy] = useState(false)
  const [lfKind, setLfKind] = useState<"lost" | "found">("lost")
  const [lfName, setLfName] = useState("")
  const [lfSpecies, setLfSpecies] = useState<Species>("dog")
  const [lfBreed, setLfBreed] = useState("")
  const [lfColor, setLfColor] = useState("")
  const [lfLastSeen, setLfLastSeen] = useState("")
  const [lfReward, setLfReward] = useState("")
  const [lfImage, setLfImage] = useState<File | null>(null)

  const [evOpen, setEvOpen] = useState(false)
  const [evBusy, setEvBusy] = useState(false)
  const [evTitle, setEvTitle] = useState("")
  const [evCategory, setEvCategory] = useState("Social")
  const [evStartsAt, setEvStartsAt] = useState("")
  const [evLocation, setEvLocation] = useState("")
  const [evCap, setEvCap] = useState("")

  /* The search box, finally real. A client-side filter over the LOADED list of
   * the open tab — nothing is refetched, so it is instant and it never shows a
   * neighbour a row RLS would not have handed them. */
  const needle = query.trim().toLowerCase()
  const shownPosts = useMemo(
    () =>
      needle
        ? posts.filter(
            (p) =>
              p.content.toLowerCase().includes(needle) ||
              p.author.toLowerCase().includes(needle) ||
              p.category.toLowerCase().includes(needle),
          )
        : posts,
    [posts, needle],
  )
  const shownLostFound = useMemo(
    () =>
      needle
        ? lostFound.filter((i) =>
            [i.petName, i.breed, i.color, i.lastSeen].some((f) => (f ?? "").toLowerCase().includes(needle)),
          )
        : lostFound,
    [lostFound, needle],
  )
  const shownEvents = useMemo(
    () =>
      needle
        ? events.filter((e) =>
            [e.title, e.location, e.category].some((f) => (f ?? "").toLowerCase().includes(needle)),
          )
        : events,
    [events, needle],
  )

  const toggleLike = async (postId: string, liked: boolean) => {
    if (busyId) return
    setBusyId(postId)
    const { error } = await togglePostLike(postId, liked)
    setBusyId(null)
    if (error) return toast.error("Couldn't update like", { description: error })
    refetchPosts()
  }

  const handleCreatePost = async () => {
    if (!composerContent.trim()) return
    setPosting(true)
    const { error } = await createCommunityPost({
      content: composerContent.trim(),
      category: composerCategory,
      imageFile: composerImage ?? undefined,
    })
    setPosting(false)
    if (error) return toast.error("Couldn't post", { description: error })
    toast.success("Posted to your building")
    setComposerContent("")
    setComposerImage(null)
    setComposerCategory("General")
    setComposerOpen(false)
    refetchPosts()
  }

  const openComments = async (postId: string) => {
    setCommentsFor(postId)
    setCommentsLoading(true)
    const rows = await fetchPostComments(postId)
    setComments(rows)
    setCommentsLoading(false)
  }

  const handleAddComment = async () => {
    if (!commentsFor || !newComment.trim()) return
    setCommenting(true)
    const { error } = await addPostComment(commentsFor, newComment.trim())
    setCommenting(false)
    if (error) return toast.error("Couldn't add comment", { description: error })
    setNewComment("")
    setComments(await fetchPostComments(commentsFor))
    refetchPosts()
  }

  const handleDeleteComment = async (id: string) => {
    const { error } = await deletePostComment(id)
    if (error) return toast.error("Couldn't remove that comment", { description: error })
    if (commentsFor) setComments(await fetchPostComments(commentsFor))
    refetchPosts()
  }

  const handlePin = async (post: CommunityPost) => {
    if (busyId) return
    setBusyId(post.id)
    const { error } = await pinPost(post.id, !post.isPinned)
    setBusyId(null)
    if (error) return toast.error("Couldn't pin that post", { description: error })
    toast.success(post.isPinned ? "Unpinned" : "Pinned to the top of the feed")
    refetchPosts()
  }

  const handleRemovePost = async (post: CommunityPost) => {
    setMenuFor(null)
    const mine = !!post.authorId && post.authorId === user?.id
    const { error } = await removePost(post.id, { mine })
    if (error) return toast.error("Couldn't remove that post", { description: error })
    toast.success("Post removed")
    refetchPosts()
  }

  const handleRsvp = async (event: CommunityEvent) => {
    if (busyId) return
    setBusyId(event.id)
    const { error } = await rsvpToEvent(event.id, !event.going)
    setBusyId(null)
    if (error) return toast.error("Couldn't update your RSVP", { description: error })
    refetchEvents()
  }

  const handlePublish = async (event: CommunityEvent) => {
    if (busyId) return
    setBusyId(event.id)
    const { error } = await publishEvent(event.id)
    setBusyId(null)
    if (error) return toast.error("Couldn't announce that event", { description: error })
    toast.success("Announced to the building")
  }

  const handleReportLostFound = async () => {
    if (!lfName.trim()) return
    setLfBusy(true)
    const cents = lfReward.trim() ? Math.round(Number(lfReward) * 100) : null
    const { error } = await reportLostFound({
      kind: lfKind,
      petName: lfName.trim(),
      species: lfSpecies,
      breed: lfBreed.trim() || undefined,
      color: lfColor.trim() || undefined,
      lastSeen: lfLastSeen.trim() || undefined,
      rewardCents: cents && cents > 0 ? cents : null,
      imageFile: lfImage ?? undefined,
    })
    setLfBusy(false)
    if (error) return toast.error("Couldn't post that report", { description: error })
    toast.success("Your neighbours have been notified")
    setLfOpen(false)
    setLfName("")
    setLfBreed("")
    setLfColor("")
    setLfLastSeen("")
    setLfReward("")
    setLfImage(null)
    refetchLostFound()
  }

  const handleResolve = async (item: LostFoundItem) => {
    if (busyId) return
    setBusyId(item.id)
    const { error } = await resolveLostFound(item.id)
    setBusyId(null)
    if (error) return toast.error("Couldn't resolve that report", { description: error })
    toast.success("Marked resolved")
    refetchLostFound()
  }

  /* navigator.share with a clipboard fallback, both guarded by
   * `typeof navigator !== "undefined"` — the pattern onboarding-flow.tsx
   * already uses. NO `url` IS PASSED: there is no public page for a lost pet,
   * and a signed storage URL carries the object path — including an auth uid —
   * verbatim. */
  const handleShareLostFound = async (item: LostFoundItem) => {
    const text = lostFoundShareText({
      type: item.type,
      petName: item.petName,
      species: item.species,
      breed: item.breed,
      color: item.color,
      lastSeen: item.lastSeen,
      buildingName: item.buildingName,
      rewardCents: item.rewardCents,
    })
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title: item.petName ?? "Pet10x", text })
      } else if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(text)
        toast.success("Copied", { description: "Paste it wherever it will reach people." })
      } else {
        toast.error("Sharing isn't available on this device")
      }
    } catch {
      /* the person dismissed the share sheet */
    }
  }

  const handleCreateEvent = async () => {
    if (!evTitle.trim() || !evStartsAt) return
    setEvBusy(true)
    const cap = evCap.trim() ? Number(evCap) : null
    const { error } = await createEvent({
      title: evTitle.trim(),
      category: evCategory,
      /* `datetime-local` gives a zoneless "2026-06-27T18:00". new Date() reads
       * that as LOCAL time, which is what the organiser typed, and toISOString
       * converts it to the instant the timestamptz column wants. */
      startsAt: new Date(evStartsAt).toISOString(),
      location: evLocation.trim() || null,
      maxAttendees: cap && cap > 0 ? Math.round(cap) : null,
    })
    setEvBusy(false)
    if (error) return toast.error("Couldn't create that event", { description: error })
    toast.success("Event added to the calendar")
    setEvOpen(false)
    setEvTitle("")
    setEvLocation("")
    setEvCap("")
    setEvStartsAt("")
    refetchEvents()
  }

  const composerTitle = managesThis ? "Post an announcement" : "New post"

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <IOSNavBar
        title="Community"
        largeTitle={false}
        leftAction={<NavBackButton onClick={() => onNavigate?.("home")} />}
        rightAction={
          <button
            onClick={() => setComposerOpen(true)}
            className="flex items-center gap-1.5 rounded-lg bg-primary/10 px-2.5 py-1.5 text-[12.5px] font-semibold text-primary"
          >
            <Plus className="h-3.5 w-3.5" /> New post
          </button>
        }
      />

      {/* Segmented Control */}
      <div className="sticky top-16 z-30 bg-background px-4 pb-3">
        <div className="flex rounded-xl bg-muted p-1">
          {(["feed", "lost", "events"] as FeedTab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 rounded-lg py-2 text-[13px] font-semibold transition-all ${
                activeTab === tab ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
              }`}
            >
              {tab === "feed" ? "Feed" : tab === "lost" ? "Lost & Found" : "Events"}
            </button>
          ))}
        </div>

        <div className="mt-3 flex items-center gap-2 rounded-xl bg-muted px-3 py-2.5">
          <Search className="h-4 w-4 flex-shrink-0 text-muted-foreground" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search community..."
            aria-label="Search the community"
            className="min-w-0 flex-1 bg-transparent text-[15px] text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
          {query && (
            <button onClick={() => setQuery("")} aria-label="Clear search" className="flex-shrink-0 p-0.5">
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          )}
        </div>
      </div>

      <main className="ios-scroll flex-1 px-4 pb-24">
        {/* Feed Tab */}
        {activeTab === "feed" && (
          <div className="flex flex-col gap-4">
            {managesThis && (
              <button
                onClick={() => setComposerOpen(true)}
                className="flex items-center gap-3 rounded-2xl border-2 border-dashed border-info/30 bg-info/5 p-4 transition-transform active:scale-[0.98]"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-info/10">
                  <Megaphone className="h-5 w-5 text-info" />
                </div>
                <div className="flex-1 text-left">
                  <p className="text-[15px] font-semibold text-foreground">Post Official Announcement</p>
                  <p className="text-[12px] text-muted-foreground">
                    Broadcast to all {scope?.buildingName ?? "building"} residents
                  </p>
                </div>
              </button>
            )}
            {!postsLoading && shownPosts.length === 0 && (
              <EmptyState
                icon={Users}
                title={needle ? "Nothing matches that" : "No posts yet"}
                subtext={
                  needle
                    ? "Try a different word, or clear the search to see the whole feed."
                    : "The community feed is quiet for now. Share an update, a tip, or a hello with your neighbours."
                }
                cta={needle ? undefined : "Be the first to share"}
                onCta={needle ? undefined : () => setComposerOpen(true)}
              />
            )}
            {shownPosts.map((post) => {
              const mine = !!post.authorId && post.authorId === user?.id
              const canRemove = mine || managesThis
              return (
                <article key={post.id} className="rounded-2xl card-raised overflow-hidden">
                  <div className="p-4">
                    {/* items-START, not items-center. With BOTH a Pin button and
                        a More button in this row, the name/badge line wraps at
                        393px, and an avatar centred against a two-line stack
                        reads as a misalignment. Seen in a browser at phone
                        width as the manager, not reasoned about — the resident
                        view, with one fewer button, never wrapped. The name now
                        owns its own line and the metadata sits under it. */}
                    <div className="flex items-start gap-3">
                      <div className="relative h-10 w-10 flex-shrink-0 overflow-hidden rounded-full bg-muted">
                        <Image src={post.avatar || AVATAR_FALLBACK} alt={post.author} fill className="object-cover" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="text-[15px] font-semibold text-foreground break-words">{post.author}</span>
                          {post.isPinned && <Pin className="h-3 w-3 flex-shrink-0 text-info" aria-label="Pinned" />}
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                          <Badge className={`text-[10px] border-0 ${categoryClass(post.category)}`}>
                            {post.category}
                          </Badge>
                          {post.isOfficial && (
                            <Badge className="border-0 bg-info/10 text-[10px] text-info">Official</Badge>
                          )}
                          <span className="text-[12px] text-muted-foreground">{post.time}</span>
                        </div>
                      </div>
                      {managesThis && (
                        <button
                          onClick={() => handlePin(post)}
                          disabled={busyId === post.id}
                          className="flex flex-shrink-0 items-center gap-1 rounded-full bg-info/10 px-2.5 py-1 text-[11px] font-semibold text-info disabled:opacity-50"
                        >
                          {post.isPinned ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
                          {post.isPinned ? "Unpin" : "Pin"}
                        </button>
                      )}
                      {/* Not rendered at all when the viewer can do nothing to
                          this post. A menu whose only state is "you may not" is
                          the toast this replaced, with extra steps. */}
                      {canRemove && (
                        <button
                          onClick={() => setMenuFor(post)}
                          className="flex-shrink-0 p-1"
                          aria-label={`More options for ${post.author}'s post`}
                        >
                          <MoreHorizontal className="h-5 w-5 text-muted-foreground" />
                        </button>
                      )}
                    </div>
                    {/* break-words, and not decoration: `main` is overflow-x
                        auto on both axes, so one long unbroken token puts a
                        resident's text out of view with NO page scrollbar. */}
                    <p className="mt-3 whitespace-pre-wrap break-words text-[15px] leading-relaxed text-foreground">
                      {post.content}
                    </p>
                  </div>
                  {post.image && (
                    <div className="relative h-52 w-full bg-muted">
                      <Image src={post.image} alt="" fill className="object-cover" />
                    </div>
                  )}
                  <div className="flex items-center gap-6 border-t border-border px-4 py-3">
                    <button
                      onClick={() => toggleLike(post.id, post.liked)}
                      disabled={busyId === post.id}
                      className="flex items-center gap-1.5 disabled:opacity-60"
                      aria-label={post.liked ? "Unlike" : "Like"}
                    >
                      <Heart
                        className={`h-5 w-5 transition-colors ${
                          post.liked ? "fill-destructive text-destructive" : "text-muted-foreground"
                        }`}
                      />
                      <span className="text-[13px] text-muted-foreground">{post.likes}</span>
                    </button>
                    <button onClick={() => openComments(post.id)} className="flex items-center gap-1.5">
                      <MessageCircle className="h-5 w-5 text-muted-foreground" />
                      <span className="text-[13px] text-muted-foreground">{post.comments}</span>
                    </button>
                  </div>
                </article>
              )
            })}
          </div>
        )}

        {/* Lost & Found Tab */}
        {activeTab === "lost" && (
          <div className="flex flex-col gap-3">
            <button
              onClick={() => setLfOpen(true)}
              className="flex items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-[14px] font-semibold text-primary-foreground"
            >
              <Plus className="h-4 w-4" /> Report a lost or found pet
            </button>
            {shownLostFound.length === 0 && (
              <EmptyState
                icon={MapPin}
                title={needle ? "Nothing matches that" : "Nothing lost or found"}
                subtext={
                  needle
                    ? "Try a different word, or clear the search."
                    : "No active reports right now. If a pet goes missing or you spot one wandering, post here to reach the whole building fast."
                }
              />
            )}
            {shownLostFound.map((item) => {
              const SpeciesIcon = item.species === "cat" ? Cat : Dog
              const lost = item.type === "lost"
              return (
                <div
                  key={item.id}
                  className={`overflow-hidden rounded-2xl border-2 ${lost ? "border-destructive/30" : "border-success/30"}`}
                >
                  <div className={`px-3 py-1.5 ${lost ? "bg-destructive/10" : "bg-success/10"}`}>
                    <div className="flex items-center gap-2">
                      <AlertTriangle className={`h-4 w-4 flex-shrink-0 ${lost ? "text-destructive" : "text-success"}`} />
                      <span
                        className={`text-[13px] font-bold uppercase ${lost ? "text-destructive" : "text-success"}`}
                      >
                        {lost ? "Lost Pet" : "Found Pet"}
                      </span>
                      {item.reward && (
                        <Badge className="ml-auto border-0 bg-primary text-[10px] text-primary-foreground">
                          Reward: {item.reward}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-3 bg-card p-3">
                    <div className="relative h-24 w-24 flex-shrink-0 overflow-hidden rounded-xl bg-muted">
                      <Image
                        src={item.image || PHOTO_FALLBACK}
                        alt={item.petName ?? "Pet"}
                        fill
                        className="object-cover"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <SpeciesIcon className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                        <span className="text-[17px] font-semibold text-foreground break-words">
                          {item.petName ?? "A pet"}
                        </span>
                      </div>
                      <p className="text-[13px] text-muted-foreground break-words">
                        {[item.breed, item.color].filter(Boolean).join(" · ") || "No description given"}
                      </p>
                      {item.lastSeen && (
                        <div className="mt-2 flex items-start gap-1">
                          <MapPin className="mt-0.5 h-3 w-3 flex-shrink-0 text-muted-foreground" />
                          <span className="text-[12px] text-muted-foreground break-words">{item.lastSeen}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
                        <span className="text-[12px] text-muted-foreground">{item.time}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 border-t border-border bg-card px-3 py-2.5">
                    <button
                      onClick={() => handleShareLostFound(item)}
                      className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-[12.5px] font-semibold text-foreground"
                    >
                      <Share2 className="h-3.5 w-3.5" /> Share
                    </button>
                    {(item.mine || managesThis) && (
                      <button
                        onClick={() => handleResolve(item)}
                        disabled={busyId === item.id}
                        className="flex items-center gap-1.5 rounded-full bg-success/10 px-3 py-1.5 text-[12.5px] font-semibold text-success disabled:opacity-50"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" /> Mark resolved
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Events Tab */}
        {activeTab === "events" && (
          <div className="flex flex-col gap-3">
            <button
              onClick={() => setEvOpen(true)}
              className="flex items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-[14px] font-semibold text-primary-foreground"
            >
              <Plus className="h-4 w-4" /> Suggest an event
            </button>
            {shownEvents.length === 0 && (
              <EmptyState
                icon={CalendarDays}
                title={needle ? "Nothing matches that" : "No upcoming events"}
                subtext={
                  needle
                    ? "Try a different word, or clear the search."
                    : "Nothing on the calendar yet. Meetups, play dates and building gatherings will show up here once they're scheduled."
                }
              />
            )}
            {shownEvents.map((event) => {
              const when = formatEventDate(event.startsAt)
              const pct = attendancePercent(event.attendees, event.maxAttendees)
              return (
                <div key={event.id} className="rounded-2xl card-raised p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      {event.category && (
                        <Badge className={`mb-2 border-0 text-[10px] ${categoryClass(event.category)}`}>
                          {event.category}
                        </Badge>
                      )}
                      <h3 className="text-[17px] font-semibold text-foreground break-words">{event.title}</h3>
                    </div>
                    <div className="flex flex-shrink-0 flex-col items-center rounded-xl bg-primary/10 px-3 py-2">
                      <span className="text-[11px] font-medium text-primary">{when.day}</span>
                      <span className="text-[15px] font-bold text-primary">{when.date}</span>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-col gap-1">
                    <div className="flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                      <span className="text-[13px] text-muted-foreground">{when.full}</span>
                    </div>
                    {event.location && (
                      <div className="flex items-start gap-1.5">
                        <MapPin className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                        <span className="text-[13px] text-muted-foreground break-words">{event.location}</span>
                      </div>
                    )}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      {/* No bar at all when there is no cap. The old expression
                          `(attendees / maxAttendees) * 100` is Infinity for a
                          null cap and rendered `width: Infinity%`. */}
                      {pct !== null && (
                        <div className="h-1.5 w-24 flex-shrink-0 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                        </div>
                      )}
                      <span className="text-[12px] text-muted-foreground">
                        {event.maxAttendees === null
                          ? `${event.attendees} going`
                          : `${event.attendees}/${event.maxAttendees} going`}
                      </span>
                    </div>
                    <button
                      onClick={() => handleRsvp(event)}
                      disabled={busyId === event.id}
                      className={`rounded-full px-4 py-1.5 text-[13px] font-semibold disabled:opacity-50 ${
                        event.going
                          ? "border border-border bg-card text-foreground"
                          : "bg-primary text-primary-foreground"
                      }`}
                    >
                      {event.going ? "Going ✓" : "RSVP"}
                    </button>
                  </div>
                  {/* The names, not just a number. `rsvps_read` is what makes
                      the count possible and it necessarily discloses WHO, so the
                      disclosure is shown rather than implied. */}
                  {event.attendeeNames.length > 0 && (
                    <p className="mt-2 text-[12px] text-muted-foreground break-words">
                      {event.attendeeNames.join(", ")}
                    </p>
                  )}
                  {managesThis && (
                    <button
                      onClick={() => handlePublish(event)}
                      disabled={busyId === event.id}
                      className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-info/30 bg-info/5 py-2 text-[13px] font-semibold text-info disabled:opacity-50"
                    >
                      <Megaphone className="h-4 w-4" /> Announce to the building
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </main>

      {composerOpen && (
        <Sheet title={composerTitle} onClose={() => setComposerOpen(false)} busy={posting}>
          <label className="block text-[13px] font-medium text-muted-foreground" htmlFor="post-category">
            Category
          </label>
          <select
            id="post-category"
            value={composerCategory}
            onChange={(e) => setComposerCategory(e.target.value)}
            className={FIELD}
          >
            {POST_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <label className="mt-4 block text-[13px] font-medium text-muted-foreground" htmlFor="post-content">
            What&apos;s happening?
          </label>
          <textarea
            id="post-content"
            value={composerContent}
            onChange={(e) => setComposerContent(e.target.value)}
            placeholder="Share an update, a tip, or a hello with your neighbours..."
            rows={4}
            className={`${FIELD} resize-none`}
          />
          <label className="mt-4 block text-[13px] font-medium text-muted-foreground" htmlFor="post-photo">
            Photo (optional)
          </label>
          <input
            id="post-photo"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            onChange={(e) => setComposerImage(e.target.files?.[0] ?? null)}
            className="mt-1 w-full text-[13px] text-muted-foreground"
          />
          <div className="mt-5 flex gap-2">
            <button
              onClick={() => setComposerOpen(false)}
              disabled={posting}
              className="flex-1 rounded-xl border border-border py-2.5 text-[14px] font-semibold text-foreground disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              onClick={handleCreatePost}
              disabled={posting || !composerContent.trim()}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-[14px] font-semibold text-primary-foreground disabled:opacity-60"
            >
              {posting && <Loader2 className="h-4 w-4 animate-spin" />} Post
            </button>
          </div>
        </Sheet>
      )}

      {lfOpen && (
        <Sheet title="Report a pet" onClose={() => setLfOpen(false)} busy={lfBusy}>
          <div className="flex rounded-xl bg-muted p-1">
            {(["lost", "found"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setLfKind(k)}
                className={`flex-1 rounded-lg py-2 text-[13px] font-semibold ${
                  lfKind === k ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
                }`}
              >
                {k === "lost" ? "I lost a pet" : "I found a pet"}
              </button>
            ))}
          </div>
          <label className="mt-4 block text-[13px] font-medium text-muted-foreground" htmlFor="lf-name">
            Pet name
          </label>
          <input id="lf-name" value={lfName} onChange={(e) => setLfName(e.target.value)} maxLength={80} className={FIELD} />
          <label className="mt-4 block text-[13px] font-medium text-muted-foreground" htmlFor="lf-species">
            Species
          </label>
          <select
            id="lf-species"
            value={lfSpecies}
            onChange={(e) => setLfSpecies(e.target.value as Species)}
            className={FIELD}
          >
            {(["dog", "cat", "bird", "small_mammal", "fish", "reptile", "other"] as Species[]).map((s) => (
              <option key={s} value={s}>
                {s === "small_mammal" ? "Small mammal" : s[0].toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
          <label className="mt-4 block text-[13px] font-medium text-muted-foreground" htmlFor="lf-breed">
            Breed
          </label>
          <input id="lf-breed" value={lfBreed} onChange={(e) => setLfBreed(e.target.value)} maxLength={80} className={FIELD} />
          <label className="mt-4 block text-[13px] font-medium text-muted-foreground" htmlFor="lf-color">
            Colour
          </label>
          <input id="lf-color" value={lfColor} onChange={(e) => setLfColor(e.target.value)} maxLength={40} className={FIELD} />
          <label className="mt-4 block text-[13px] font-medium text-muted-foreground" htmlFor="lf-seen">
            {lfKind === "lost" ? "Last seen" : "Where you found them"}
          </label>
          <textarea
            id="lf-seen"
            value={lfLastSeen}
            onChange={(e) => setLfLastSeen(e.target.value)}
            maxLength={500}
            rows={2}
            className={`${FIELD} resize-none`}
          />
          {lfKind === "lost" && (
            <>
              <label className="mt-4 block text-[13px] font-medium text-muted-foreground" htmlFor="lf-reward">
                Reward in dollars (optional)
              </label>
              <input
                id="lf-reward"
                type="number"
                min="0"
                step="1"
                value={lfReward}
                onChange={(e) => setLfReward(e.target.value)}
                className={FIELD}
              />
            </>
          )}
          <label className="mt-4 block text-[13px] font-medium text-muted-foreground" htmlFor="lf-photo">
            Photo (optional)
          </label>
          <input
            id="lf-photo"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            onChange={(e) => setLfImage(e.target.files?.[0] ?? null)}
            className="mt-1 w-full text-[13px] text-muted-foreground"
          />
          <p className="mt-4 text-[12px] leading-relaxed text-muted-foreground">
            Everyone in your building gets a notification. You can post up to three reports a day.
          </p>
          <div className="mt-4 flex gap-2">
            <button
              onClick={() => setLfOpen(false)}
              disabled={lfBusy}
              className="flex-1 rounded-xl border border-border py-2.5 text-[14px] font-semibold text-foreground disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              onClick={handleReportLostFound}
              disabled={lfBusy || !lfName.trim()}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-[14px] font-semibold text-primary-foreground disabled:opacity-60"
            >
              {lfBusy && <Loader2 className="h-4 w-4 animate-spin" />} Post report
            </button>
          </div>
        </Sheet>
      )}

      {evOpen && (
        <Sheet title="Suggest an event" onClose={() => setEvOpen(false)} busy={evBusy}>
          <label className="block text-[13px] font-medium text-muted-foreground" htmlFor="ev-title">
            Title
          </label>
          <input id="ev-title" value={evTitle} onChange={(e) => setEvTitle(e.target.value)} maxLength={120} className={FIELD} />
          <label className="mt-4 block text-[13px] font-medium text-muted-foreground" htmlFor="ev-category">
            Category
          </label>
          <select id="ev-category" value={evCategory} onChange={(e) => setEvCategory(e.target.value)} className={FIELD}>
            {POST_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <label className="mt-4 block text-[13px] font-medium text-muted-foreground" htmlFor="ev-when">
            Starts
          </label>
          <input
            id="ev-when"
            type="datetime-local"
            value={evStartsAt}
            onChange={(e) => setEvStartsAt(e.target.value)}
            className={FIELD}
          />
          <label className="mt-4 block text-[13px] font-medium text-muted-foreground" htmlFor="ev-where">
            Location
          </label>
          <input id="ev-where" value={evLocation} onChange={(e) => setEvLocation(e.target.value)} maxLength={120} className={FIELD} />
          <label className="mt-4 block text-[13px] font-medium text-muted-foreground" htmlFor="ev-cap">
            Maximum attendees (optional)
          </label>
          <input
            id="ev-cap"
            type="number"
            min="1"
            step="1"
            value={evCap}
            onChange={(e) => setEvCap(e.target.value)}
            className={FIELD}
          />
          <p className="mt-4 text-[12px] leading-relaxed text-muted-foreground">
            {managesThis
              ? "It appears in the Events tab straight away. Use Announce to notify every resident."
              : "It appears in the Events tab for everyone in your building. Your building manager can announce it to everyone's notifications."}
          </p>
          <div className="mt-4 flex gap-2">
            <button
              onClick={() => setEvOpen(false)}
              disabled={evBusy}
              className="flex-1 rounded-xl border border-border py-2.5 text-[14px] font-semibold text-foreground disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              onClick={handleCreateEvent}
              disabled={evBusy || !evTitle.trim() || !evStartsAt}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-[14px] font-semibold text-primary-foreground disabled:opacity-60"
            >
              {evBusy && <Loader2 className="h-4 w-4 animate-spin" />} Add event
            </button>
          </div>
        </Sheet>
      )}

      {menuFor && (
        <Sheet title="Post options" onClose={() => setMenuFor(null)}>
          <button
            onClick={() => handleRemovePost(menuFor)}
            className="flex w-full items-center gap-3 rounded-xl px-2 py-3 text-left text-[15px] font-medium text-destructive"
          >
            <Trash2 className="h-5 w-5" />
            {menuFor.authorId === user?.id ? "Remove my post" : "Remove this post"}
          </button>
          <p className="mt-1 px-2 text-[12px] leading-relaxed text-muted-foreground">
            {menuFor.authorId === user?.id
              ? "It disappears from the feed. Comments and reactions go with it."
              : "Removing a neighbour's post is recorded in the building's audit log, with your name on it."}
          </p>
        </Sheet>
      )}

      {commentsFor && (
        <Portal>
          <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:px-6"
            onClick={() => setCommentsFor(null)}
          >
            <div
              className="flex max-h-[70vh] w-full max-w-sm flex-col rounded-t-2xl bg-card sm:rounded-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="border-b border-border p-4">
                <h3 className="text-[17px] font-semibold text-foreground">Comments</h3>
              </div>
              <div className="ios-scroll flex-1 overflow-y-auto p-4">
                {commentsLoading && (
                  <div className="flex justify-center py-6">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                )}
                {!commentsLoading && comments.length === 0 && (
                  <p className="py-6 text-center text-[13px] text-muted-foreground">
                    No comments yet — say something!
                  </p>
                )}
                <div className="flex flex-col gap-3">
                  {comments.map((c) => (
                    <div key={c.id} className="flex gap-2.5">
                      <div className="relative h-8 w-8 flex-shrink-0 overflow-hidden rounded-full bg-muted">
                        <Image src={c.avatar || AVATAR_FALLBACK} alt={c.author} fill className="object-cover" />
                      </div>
                      <div className="min-w-0 flex-1 rounded-xl bg-muted px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] font-semibold text-foreground break-words">{c.author}</span>
                          <span className="text-[11px] text-muted-foreground">{c.time}</span>
                          {(c.authorId === user?.id || managesThis) && (
                            <button
                              onClick={() => handleDeleteComment(c.id)}
                              className="ml-auto flex-shrink-0 p-0.5"
                              aria-label={`Remove ${c.author}'s comment`}
                            >
                              <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                            </button>
                          )}
                        </div>
                        <p className="mt-0.5 whitespace-pre-wrap break-words text-[13px] text-foreground">
                          {c.content}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2 border-t border-border p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                <input
                  type="text"
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAddComment()}
                  placeholder="Add a comment..."
                  aria-label="Add a comment"
                  className="min-w-0 flex-1 rounded-full border border-input bg-card px-3.5 py-2 text-[14px] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
                <button
                  onClick={handleAddComment}
                  disabled={commenting || !newComment.trim()}
                  className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-primary disabled:opacity-60"
                  aria-label="Send comment"
                >
                  {commenting ? (
                    <Loader2 className="h-4 w-4 animate-spin text-primary-foreground" />
                  ) : (
                    <Send className="h-4 w-4 text-primary-foreground" />
                  )}
                </button>
              </div>
            </div>
          </div>
        </Portal>
      )}
    </div>
  )
}
