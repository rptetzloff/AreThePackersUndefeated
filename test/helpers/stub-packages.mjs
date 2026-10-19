// node --import this to load stub-packages-hooks.mjs before anything else.
import { register } from 'node:module'

register(new URL('./stub-packages-hooks.mjs', import.meta.url))
