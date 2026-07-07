import { createSlice } from '@reduxjs/toolkit'

export const damrSlice = createSlice({
  name: 'Damr',
  initialState: {
    loginEmail: '',
    loginPassword: '',
    token: null,
    user: null,
    spinner: false,
  },
  reducers: {
    inputLoginEmail: (state, action) => {
      state.loginEmail = action.payload
    },
    inputLoginPassword: (state, action) => {
      state.loginPassword = action.payload
    },
    setCredentials: (state, action) => {
      state.token = action.payload.token
      state.user = action.payload.user
    },
    clearCredentials: (state) => {
      state.token = null
      state.user = null
      state.loginEmail = ''
      state.loginPassword = ''
    },
    updateSpinner: (state, action) => {
      state.spinner = action.payload
    },
  },
})

export const {
  inputLoginEmail,
  inputLoginPassword,
  setCredentials,
  clearCredentials,
  updateSpinner,
} = damrSlice.actions

export default damrSlice.reducer
