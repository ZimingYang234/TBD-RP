# Guía de Juego — TBD

Bienvenido a **TBD**, un RPG cooperativo por navegador para **1 a 3 jugadores** inspirado en *Dungeons & Dragons* (D&D), pensado para jugar rápido desde cualquier portátil o Chromebook.

---

## 1. Cómo empezar una partida

1. Escribe el **nombre de tu personaje**.
2. Elige una **clase**:
   - **Guerrero**: mucha vida y armadura. Ideal para aguantar golpes.
   - **Mago**: menos vida, pero gran daño mágico.
   - **Pícaro**: muy ágil, suele actuar primero en los turnos y hace críticos con facilidad.
3. Pulsa **Crear sala** (te dará un **código de 4 letras** para pasarle a tus amigos) o introduce el código de un amigo y pulsa **Unirse**.
4. Cuando estéis listos (1, 2 o 3 jugadores), el líder pulsa **Comenzar aventura**.

> **¿Se te cerró o recargó la pestaña?** Al volver a abrir el enlace en la misma pestaña, entrarás automáticamente de nuevo con tu personaje.

---

## 2. Controles y casillas del mapa

- **Moverse**: haz **clic** directamente en cualquier casilla del mapa o usa las teclas **WASD** / **Flechas**.
- **Calidad gráfica**: arriba puedes cambiar entre **Baja**, **Media** y **Alta** en cualquier momento (si vas en un Chromebook lento, usa *Baja*).

### Qué es cada casilla especial
- **Círculo morado (Portal)**: teletransporta a **todo el grupo** a otro reino (*Valderroble*, *Solceniza*, *Ventisca* o *Plano Astral*).
- **Rombo dorado (Evento)**: activa una historia corta con **3 opciones** para votar entre todos.
- **Espadas rojas (Combate)**: inicia una batalla por turnos contra monstruos del reino.
- **Moneda turquesa `$` (Tienda)**: abre la tienda para gastar tus monedas (también puedes abrirla con el botón **Tienda de Objetos**).

---

## 3. Qué significan los términos del juego

- **PV (Puntos de Vida)**: tu salud. Si llega a `0` en combate contra monstruos, caes inconsciente; si cae todo el grupo, despertáis a salvo en la entrada del reino con la mitad de PV.
- **CA (Clase de Armadura)**: indica lo difícil que es acertarte un golpe. **Cuanto más alta sea tu CA, menos veces te darán** los enemigos.
- **Ataque (`+mod`)**: bonificador que se suma a tu tirada oculta de ataque contra la **CA** del rival.
- **Suerte**: mejora tus probabilidades al usar **Suerte (50/50)** en combate.
- **Iniciativa**: al empezar un combate, el servidor tira un dado por cada personaje y enemigo para decidir **quién actúa primero** y el orden de los turnos.
- **Crítico**: un golpe perfecto que hace mucho más daño de lo normal.
- **Pifia**: un fallo cómico y desastroso al atacar.
- **EXP (Experiencia)** y **Monedas**: recompensas que ganas al completar misiones, eventos, combates y duelos.

---

## 4. Modos de juego y acciones

### Eventos con votación (IA Dungeon Master)
Al pisar un **rombo dorado** o cruzar un **portal**, aparece un evento con 3 decisiones. Cada jugador vota su opción favorita; cuando todos votan (o el líder pulsa *Resolver ahora*), se aplica el resultado al grupo.

### Combate (PvE, Jefes y Duelo PvP)
Puedes luchar pisando las **espadas rojas** o usando los botones del panel derecho:
- **Combate PvE**: lucha cooperativa contra enemigos del reino.
- **Jefe**: desafío contra el jefe del reino actual (más difícil, pero da muchas monedas y EXP).
- **Duelo PvP** *(2 o más jugadores)*: pelea amistosa entre vosotros. El ganador recibe monedas y EXP, y al terminar todos recuperáis el 100% de los PV.

#### Acciones en tu turno
1. **Atacar**: ataque normal contra el objetivo seleccionado.
2. **Suerte (50/50)**: todo o nada — si sale bien, aciertas siempre y haces **doble daño** (y si es suerte legendaria, **triple daño + 5 monedas**); si sale mal, tropiezas y te haces un poco de daño.
3. **Habilidad Especial** *(1 uso por combate)*:
   - **Guerrero — *Tajo Sísmico***: golpea a **todos** los enemigos a la vez.
   - **Mago — *Bola de Fuego***: daño mágico directo que **ignora la CA** del rival.
   - **Pícaro — *Golpe Furtivo***: ataque con probabilidad muy alta de **crítico**.
4. **Defender**: te da **`+2` de CA** hasta tu próximo turno.
5. **Poción**: recupera vida durante el combate (tienes 2 gratis por combate + las que compres).
6. **Bomba** *(si compraste en la tienda)*: explota e inflige daño directo al objetivo.

### Tienda de Objetos
Todos empiezan con **20 monedas**. Puedes comprar:
- **Poción de vida** (12 monedas): cura PV en combate o fuera de él.
- **Bomba arcana** (20 monedas): daño directo en combate.
- **Filo rúnico** (30 monedas): **`+2` permanente** al ataque.
- **Armadura templada** (30 monedas): **`+2` permanente de CA**.
- **Amuleto de la Suerte** (35 monedas): **`+2` permanente** de Suerte.

### Taberna — Dados de la Fortuna
Pulsa **Taberna** para apostar **5, 10, 20 o 50 monedas** lanzando 2 dados:
- **7 a 11**: ganas el **doble (`2×`)**.
- **12**: **¡Bote Real!** Ganas **`4×`** tu apuesta.
- **2 a 6**: gana la taberna.

### Misiones
En la parte superior del panel derecho verás la **Misión actual del grupo** (cazar monstruos, viajar por portales o completar eventos). Al completarla, todo el grupo recibe monedas y EXP y aparece una misión nueva.
