export default function FieldHint({ children, id }) {
  if (!children) return null
  return (
    <p id={id} className="field-hint" role="status">
      {children}
    </p>
  )
}
