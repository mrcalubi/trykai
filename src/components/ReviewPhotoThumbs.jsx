import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { reviewPhotoPublicUrl } from '../lib/reviewPhotos'
import PhotoLightbox from './PhotoLightbox'

export default function ReviewPhotoThumbs({ paths, title = 'Review photos' }) {
  const urls = (paths ?? []).map((path) => reviewPhotoPublicUrl(path, supabase.storage)).filter(Boolean)
  const [hidden, setHidden] = useState({})
  const [lightboxIndex, setLightboxIndex] = useState(null)
  const visible = urls.filter((url) => !hidden[url])

  if (urls.length === 0) return null
  if (visible.length === 0) return null

  return (
    <>
      <ul className="review-photos">
        {urls.map((url, index) =>
          hidden[url] ? null : (
            <li key={url}>
              <button
                type="button"
                className="review-photos__tile"
                aria-label={`View review photo ${index + 1} of ${urls.length}`}
                onClick={() => setLightboxIndex(visible.indexOf(url))}
              >
                <img src={url} alt="" onError={() => setHidden((current) => ({ ...current, [url]: true }))} />
              </button>
            </li>
          ),
        )}
      </ul>
      {lightboxIndex !== null && visible.length > 0 ? (
        <PhotoLightbox
          photos={visible}
          title={title}
          startIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      ) : null}
    </>
  )
}
