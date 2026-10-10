import { formatCents } from '../lib/cancellationPolicy'

/** Space Mono's comma is wide; the separator uses the body font. */
export default function FormattedPrice({ cents }) {
  return formatCents(cents)
    .split(/([,])/)
    .map((chunk, index) =>
      chunk === ',' ? (
        <span key={index} className="price__group">
          ,
        </span>
      ) : (
        chunk
      ),
    )
}
