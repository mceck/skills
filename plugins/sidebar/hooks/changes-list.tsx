type ChangeRow = {
  code: string
  path: string
}

type Props = {
  rows?: ChangeRow[]
}

function statusColor(code: string): string {
  if (code === '??' || code.startsWith('A')) return 'success'
  if (code.startsWith('D') || code.startsWith('U')) return 'error'
  if (code.startsWith('R')) return 'suggestion'
  return 'warning'
}

export default function ChangesList(props: Props, surface: any) {
  const { Box, Text } = surface.elements
  const rows = props?.rows ?? []

  surface.onPointer((event: any) => {
    if (event.type !== 'down') return
    if (event.button !== 'left') return
    if (!event.alt && !event.ctrl) return

    const row = rows[event.y]
    if (row) surface.post({ open: row.path })
  })

  return (
    <Box flexDirection="column">
      {rows.map((row, index) => (
        <Box key={`row-${index}`} flexDirection="row">
          <Text color={statusColor(row.code)}>{row.code} </Text>
          <Text wrap="truncate-middle">{row.path}</Text>
        </Box>
      ))}
    </Box>
  )
}
