import { createTheme } from '@mui/material/styles'

export const createAppTheme = (mode: 'light' | 'dark') => createTheme({
  palette: {
    mode,
    primary: { main: mode === 'dark' ? '#83cbd0' : '#287780' },
    secondary: { main: '#ffdd04' },
    background: { default: mode === 'dark' ? '#151c23' : '#f3f5f6', paper: mode === 'dark' ? '#202a33' : '#fff' },
    text: { primary: mode === 'dark' ? '#e7edf2' : '#202a34', secondary: mode === 'dark' ? '#adbdc9' : '#62717e' },
  },
  typography: {
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    h1: { fontSize: '2.125rem', fontWeight: 700 },
  },
  components: {
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: { root: { textTransform: 'none', fontWeight: 600 } },
    },
  },
  shape: { borderRadius: 8 },
})
