---
# Copy this file to src/content/events/<your-slug>.md
# Published at https://getinvolvedvan.com/events/<your-slug>/
# A calendar file is created automatically at /events/<your-slug>.ics
#
# Times are local Van time (America/Chicago). Daylight saving is handled
# automatically. Events move to "Past events" by themselves once they end
# (the site rebuilds every morning, and visitors' browsers hide ended events).

title: Community meeting on park improvements
summary: One or two sentences about the event.

# draft | preview | published
status: draft

start: 2026-11-12T18:30
end: 2026-11-12T20:00
# allDay: true          # use instead of times for all-day events (start: 2026-11-12T00:00)

location:
  name: Van Community Center
  address: Street address, Van, TX 75790
  # online: true        # for online events (put the join link in url)
  # url: https://maps.google.com/?q=...   # map link, or join link for online events

# organizer: Get Involved Van

# scheduled | postponed | cancelled
eventStatus: scheduled

# How people sign up:
#   none     -> "No registration needed"
#   external -> a button to an outside registration page (url required)
#   rsvp     -> a simple RSVP form stored in the database
registration:
  type: none
  # url: https://example.com/register
  # label: Register on Eventbrite
  # closesAt: 2026-11-12T12:00   # RSVPs close (defaults to the start time)

# issue: park-improvements

# image:
#   src: events/community-center.jpg
#   alt: Describe the photo.
---

Details about the event: agenda, what to bring, accessibility information, parking.
