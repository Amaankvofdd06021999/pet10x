"use client"

import { useState } from "react"
import { useAuth } from "@/lib/auth-context"
import { useCommunityPosts, useLostFound, useEvents } from "@/lib/data"
import { toast } from "sonner"
import { IOSNavBar } from "@/components/ios-nav-bar"
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
  Shield,
  Users,
  CalendarDays,
  type LucideIcon,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import Image from "next/image"

type FeedTab = "feed" | "lost" | "events"

const CATEGORY_COLORS: Record<string, string> = {
  General: "bg-muted text-muted-foreground",
  Recommendation: "bg-info/10 text-info",
  Warning: "bg-destructive/10 text-destructive",
  Question: "bg-primary/10 text-primary",
  Social: "bg-primary/10 text-primary",
  Health: "bg-accent/10 text-accent",
  Building: "bg-info/10 text-info",
}

function EmptyState({
  icon: Icon,
  title,
  subtext,
  cta,
}: {
  icon: LucideIcon
  title: string
  subtext: string
  cta?: string
}) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
        <Icon className="h-6 w-6 text-primary" />
      </div>
      <h3 className="mt-4 text-[15px] font-semibold text-foreground">{title}</h3>
      <p className="mx-auto mt-1 max-w-[20rem] text-[13px] leading-relaxed text-muted-foreground">{subtext}</p>
      {cta && <p className="mt-3 text-[13px] font-semibold text-primary">{cta}</p>}
    </div>
  )
}

export function CommunityScreen() {
  const { user } = useAuth()
  const isManager = user?.role === "building-manager"
  const { data: posts } = useCommunityPosts()
  const { data: lostFound } = useLostFound()
  const { data: events } = useEvents()
  const [activeTab, setActiveTab] = useState<FeedTab>("feed")
  const [likedPosts, setLikedPosts] = useState<Set<number>>(new Set([1]))

  const toggleLike = (postId: number) => {
    setLikedPosts((prev) => {
      const next = new Set(prev)
      if (next.has(postId)) next.delete(postId)
      else next.add(postId)
      return next
    })
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <IOSNavBar
        title="Community"
        rightAction={
          <button onClick={() => toast("New post — coming soon")} className="flex h-8 w-8 items-center justify-center rounded-full bg-primary" aria-label="New post">
            <Plus className="h-4 w-4 text-primary-foreground" />
          </button>
        }
      />

      {/* Segmented Control */}
      <div className="sticky top-[88px] z-30 bg-background px-4 pb-3">
        <div className="flex rounded-xl bg-muted p-1">
          {(["feed", "lost", "events"] as FeedTab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 rounded-lg py-2 text-[13px] font-semibold transition-all ${
                activeTab === tab
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground"
              }`}
            >
              {tab === "feed" ? "Feed" : tab === "lost" ? "Lost & Found" : "Events"}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="mt-3 flex items-center gap-2 rounded-xl bg-muted px-3 py-2.5">
          <Search className="h-4 w-4 text-muted-foreground" />
          <span className="text-[15px] text-muted-foreground">Search community...</span>
        </div>
      </div>

      <main className="ios-scroll flex-1 px-4 pb-24">
        {/* Feed Tab */}
        {activeTab === "feed" && (
          <div className="flex flex-col gap-4">
            {/* Manager announcement CTA */}
            {isManager && (
              <button onClick={() => toast("Post an announcement — coming soon")} className="flex items-center gap-3 rounded-2xl border-2 border-dashed border-info/30 bg-info/5 p-4 transition-transform active:scale-[0.98]">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-info/10">
                  <Megaphone className="h-5 w-5 text-info" />
                </div>
                <div className="flex-1 text-left">
                  <p className="text-[15px] font-semibold text-foreground">Post Official Announcement</p>
                  <p className="text-[12px] text-muted-foreground">Broadcast to all building residents</p>
                </div>
              </button>
            )}
            {posts.length === 0 && (
              <EmptyState
                icon={Users}
                title="No posts yet"
                subtext="The community feed is quiet for now. Share an update, a tip, or a hello with your neighbours."
                cta="Be the first to share"
              />
            )}
            {posts.map((post) => (
              <article
                key={post.id}
                className="rounded-2xl border border-border bg-card overflow-hidden"
              >
                <div className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="relative h-10 w-10 overflow-hidden rounded-full bg-muted">
                      <Image src={post.avatar} alt={post.author} fill className="object-cover" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[15px] font-semibold text-foreground">{post.author}</span>
                        <Badge className={`text-[10px] border-0 ${CATEGORY_COLORS[post.category]}`}>
                          {post.category}
                        </Badge>
                      </div>
                      <span className="text-[12px] text-muted-foreground">
                        Unit {post.unit} &middot; {post.time}
                      </span>
                    </div>
                    {isManager ? (
                      <button onClick={() => toast.success("Post pinned")} className="flex items-center gap-1 rounded-full bg-info/10 px-2.5 py-1 text-[11px] font-semibold text-info" aria-label="Pin post">
                        <Pin className="h-3 w-3" />
                        Pin
                      </button>
                    ) : (
                      <button onClick={() => toast("More options — coming soon")} className="p-1" aria-label="More options">
                        <MoreHorizontal className="h-5 w-5 text-muted-foreground" />
                      </button>
                    )}
                  </div>
                  <p className="mt-3 text-[15px] leading-relaxed text-foreground">{post.content}</p>
                </div>
                {post.image && (
                  <div className="relative h-52 w-full bg-muted">
                    <Image src={post.image} alt="Post image" fill className="object-cover" />
                  </div>
                )}
                <div className="flex items-center gap-6 px-4 py-3 border-t border-border">
                  <button
                    onClick={() => toggleLike(post.id)}
                    className="flex items-center gap-1.5"
                  >
                    <Heart
                      className={`h-5 w-5 transition-colors ${
                        likedPosts.has(post.id) ? "fill-destructive text-destructive" : "text-muted-foreground"
                      }`}
                    />
                    <span className="text-[13px] text-muted-foreground">
                      {post.likes + (likedPosts.has(post.id) && !post.liked ? 1 : 0) - (!likedPosts.has(post.id) && post.liked ? 1 : 0)}
                    </span>
                  </button>
                  <button onClick={() => toast("Comments — coming soon")} className="flex items-center gap-1.5">
                    <MessageCircle className="h-5 w-5 text-muted-foreground" />
                    <span className="text-[13px] text-muted-foreground">{post.comments}</span>
                  </button>
                  <button onClick={() => toast.success("Link copied")} className="ml-auto">
                    <Share2 className="h-5 w-5 text-muted-foreground" />
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}

        {/* Lost & Found Tab */}
        {activeTab === "lost" && (
          <div className="flex flex-col gap-3">
            {lostFound.length === 0 && (
              <EmptyState
                icon={MapPin}
                title="Nothing lost or found"
                subtext="No active reports right now. If a pet goes missing or you spot one wandering, post here to reach the whole building fast."
                cta="Report a lost or found pet"
              />
            )}
            {lostFound.map((item) => {
              const SpeciesIcon = item.species === "dog" ? Dog : Cat
              return (
                <div
                  key={item.id}
                  className={`rounded-2xl border-2 overflow-hidden ${
                    item.type === "lost" ? "border-destructive/30" : "border-success/30"
                  }`}
                >
                  <div className={`px-3 py-1.5 ${item.type === "lost" ? "bg-destructive/10" : "bg-success/10"}`}>
                    <div className="flex items-center gap-2">
                      <AlertTriangle className={`h-4 w-4 ${item.type === "lost" ? "text-destructive" : "text-success"}`} />
                      <span className={`text-[13px] font-bold uppercase ${item.type === "lost" ? "text-destructive" : "text-success"}`}>
                        {item.type === "lost" ? "Lost Pet" : "Found Pet"}
                      </span>
                      {item.reward && (
                        <Badge className="ml-auto bg-primary text-primary-foreground border-0 text-[10px]">
                          Reward: {item.reward}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-3 bg-card p-3">
                    <div className="relative h-24 w-24 overflow-hidden rounded-xl bg-muted flex-shrink-0">
                      <Image src={item.image} alt={item.petName} fill className="object-cover" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <SpeciesIcon className="h-4 w-4 text-muted-foreground" />
                        <span className="text-[17px] font-semibold text-foreground">{item.petName}</span>
                      </div>
                      <p className="text-[13px] text-muted-foreground">{item.breed} &middot; {item.color}</p>
                      <div className="mt-2 flex items-center gap-1">
                        <MapPin className="h-3 w-3 text-muted-foreground" />
                        <span className="text-[12px] text-muted-foreground">{item.lastSeen}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3 text-muted-foreground" />
                        <span className="text-[12px] text-muted-foreground">{item.time}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Events Tab */}
        {activeTab === "events" && (
          <div className="flex flex-col gap-3">
            {events.length === 0 && (
              <EmptyState
                icon={CalendarDays}
                title="No upcoming events"
                subtext="Nothing on the calendar yet. Meetups, play dates and building gatherings will show up here once they're scheduled."
                cta="Suggest an event"
              />
            )}
            {events.map((event) => (
              <div
                key={event.id}
                className="rounded-2xl border border-border bg-card p-4"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <Badge className={`text-[10px] border-0 mb-2 ${CATEGORY_COLORS[event.category]}`}>
                      {event.category}
                    </Badge>
                    <h3 className="text-[17px] font-semibold text-foreground">{event.title}</h3>
                  </div>
                  <div className="flex flex-col items-center rounded-xl bg-primary/10 px-3 py-2">
                    <span className="text-[11px] font-medium text-primary">{event.date.split(", ")[0]}</span>
                    <span className="text-[15px] font-bold text-primary">{event.date.split(", ")[1]?.split(" ")[1]}</span>
                  </div>
                </div>
                <div className="mt-2 flex flex-col gap-1">
                  <div className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-[13px] text-muted-foreground">{event.time}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-[13px] text-muted-foreground">{event.location}</span>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${(event.attendees / event.maxAttendees) * 100}%` }}
                      />
                    </div>
                    <span className="text-[12px] text-muted-foreground">
                      {event.attendees}/{event.maxAttendees} going
                    </span>
                  </div>
                  <button onClick={() => toast.success("RSVP confirmed")} className="rounded-full bg-primary px-4 py-1.5 text-[13px] font-semibold text-primary-foreground transition-transform active:scale-[0.97]">
                    RSVP
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
