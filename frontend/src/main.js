import { createApp } from 'vue'

// Vant base styles first so MotionCare tokens win the cascade below.
import 'vant/lib/index.css'
import {
  Button,
  Cell,
  CellGroup,
  NavBar,
  Popup,
  Tabbar,
  TabbarItem,
} from 'vant'

import App from './App.vue'
import router from './router'
import './assets/styles.css'
import './assets/app.css'

const app = createApp(App)

// Register the Vant components we actually use so <van-*> tags resolve in
// templates and the build stays tree-shakeable.
;[
  Button,
  Cell,
  CellGroup,
  NavBar,
  Popup,
  Tabbar,
  TabbarItem,
].forEach((component) => app.use(component))

app.use(router).mount('#app')
