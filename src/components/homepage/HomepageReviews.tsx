"use client"

import { useEffect, useRef, useState } from "react"
import { ChevronLeft, ChevronRight, Star } from "lucide-react"

type ReviewItem = {
  id: string
  authorName?: string
  role?: string
  rating?: number
  comment?: string
  targetName?: string
  sourceLabel?: string
}

export default function HomepageReviews() {
  const [reviews, setReviews] = useState<ReviewItem[]>([])
  const [loading, setLoading] = useState(true)
  const [activeIndex, setActiveIndex] = useState(0)
  const trackRef = useRef<HTMLDivElement | null>(null)

  const scrollToIndex = (index: number) => {
    const container = trackRef.current
    if (!container) return
    const card = container.children[index] as HTMLElement | undefined
    if (!card) return

    card.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" })
    setActiveIndex(index)
  }

  const scrollReviews = (direction: number) => {
    if (!reviews.length) return
    const nextIndex = Math.max(0, Math.min(reviews.length - 1, activeIndex + direction))
    scrollToIndex(nextIndex)
  }

  useEffect(() => {
    const loadReviews = async () => {
      try {
        const response = await fetch("/api/reviews?mode=feed&limit=6")
        const data = await response.json().catch(() => ({}))
        if (response.ok && data?.reviews) {
          setReviews(data.reviews as ReviewItem[])
        }
      } catch (error) {
        console.error("Failed to load homepage reviews", error)
      } finally {
        setLoading(false)
      }
    }

    void loadReviews()
  }, [])

  useEffect(() => {
    const container = trackRef.current
    if (!container) return

    const handleScroll = () => {
      const children = Array.from(container.children) as HTMLElement[]
      const nextIndex = children.reduce((current, child, idx) => {
        const offset = Math.abs(child.offsetLeft - container.scrollLeft)
        return offset < current.offset ? { offset, idx } : current
      }, { offset: Number.MAX_VALUE, idx: 0 }).idx
      setActiveIndex(nextIndex)
    }

    container.addEventListener("scroll", handleScroll, { passive: true })
    return () => container.removeEventListener("scroll", handleScroll)
  }, [])

  return (
    <section className="section reviews-bg" id="reviews">
      <div className="section-inner">
        <div className="section-header center">
          <div className="section-label">What People Say</div>
          <h2 className="section-title">Trusted by earners, advertisers, vendors, and customers</h2>
          <p className="section-sub">Real feedback from people using Pamba to earn, advertise, and pay bills.</p>
        </div>

        {loading ? (
          <div className="reviews-loading">Loading reviews...</div>
        ) : (
          <>
            <div className="reviews-control-row">
              <button className="review-nav-btn" type="button" onClick={() => scrollReviews(-1)} aria-label="Previous reviews">
                <ChevronLeft size={18} />
              </button>
              <button className="review-nav-btn" type="button" onClick={() => scrollReviews(1)} aria-label="Next reviews">
                <ChevronRight size={18} />
              </button>
            </div>
            <div className="reviews-track" ref={trackRef}>
              {reviews.length ? (
                reviews.map((review) => (
                  <article key={review.id} className="review-card">
                    <div className="review-rating" aria-label={`${review.rating || 0} out of 5 stars`}>
                      {Array.from({ length: Math.max(1, Math.min(5, Number(review.rating || 0))) }).map((_, index) => (
                        <Star key={index} className="review-star" />
                      ))}
                    </div>
                    <p className="review-comment">{review.comment || "Great experience."}</p>
                    <div className="review-meta">
                      <span className="review-author">{review.authorName || "Pamba user"}</span>
                      <span className="review-role">{String(review.role || "user").toUpperCase()}</span>
                    </div>
                    <div className="review-target">{review.targetName || review.sourceLabel || "Pamba"}</div>
                  </article>
                ))
              ) : (
                <div className="reviews-empty">No reviews are available right now.</div>
              )}
            </div>
            {reviews.length ? (
              <div className="review-dots">
                {reviews.map((_, index) => (
                  <button
                    key={index}
                    type="button"
                    className={`review-dot ${index === activeIndex ? "active" : ""}`}
                    onClick={() => scrollToIndex(index)}
                    aria-label={`Show review ${index + 1}`}
                  />
                ))}
              </div>
            ) : null}
          </>
        )}
      </div>
    </section>
  )
}
