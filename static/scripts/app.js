let prompt = (data) => {
    let elements = templates.prompt.content.cloneNode(true)

    elements.querySelector(".modal__header .text").textContent = data.header

    if (!data.description){
        elements.querySelector(".modal__description").remove()
    }else{
        elements.querySelector(".modal__description").textContent = data.description
    }

    elements.querySelector(".modal__input").value = data.value ?? ""
    elements.querySelector(".modal__input").placeholder = data.placeholder ?? ""

    document.body.append(elements)

    return new Promise((resolve, reject) => {
        document.querySelector(".modal:last-of-type .accept").onclick = (() => {
            let value = document.querySelector(".modal .modal__input:last-of-type").value
            document.querySelector(".modal__wrapper:last-of-type").remove()
            resolve(value)
        })

        document.querySelectorAll(".modal:last-of-type .close, .modal:last-of-type .deny").forEach(e=>e.onclick = (() => {
            document.querySelector(".modal__wrapper:last-of-type").remove()
            reject("Modal Closed")
        }))
    })
}

STATE = {
    viewpoint: {
        x: 0,
        y: 0,
        dilation: 1,
        prev_x: 0,
        prev_y: 0
    },
    drag: {
        active: false,
        element: undefined,
        offsetX: undefined,
        offsetY: undefined,
        boundsTop: undefined,
        boundsLeft: undefined,
        boundsRight: undefined,
        boundsBottom: undefined,
        find_overlaps: false,
        orig: undefined
    },
    height: undefined,
    room: undefined,
    leave_code: undefined,
    data: undefined,
    components: {}
}

let socket = io.connect("http://localhost:5000/")
socket.on('connect', function () {
    console.log("Connected to websocket!")

    let segments = new URL(location.href).pathname.split("/")
    STATE.room = segments.pop() || segments.pop()

    socket.emit("join room", {"room": STATE.room, "jwt": get_cookie("jwt")})

    STATE.leave_code = {"room": STATE.room, "jwt": get_cookie("jwt")}
})


socket.on('notes data', function (x) {
    STATE.data = x
    construct_from_root(STATE.data)
})

socket.on('error', function (x) {
    console.log(x)
})

socket.on('new member', function (user) {
    let clone = document.querySelector("#template__user").content.cloneNode(true)
    clone.querySelector("div").setAttribute("data-name", user.username)
    clone.querySelector("img").src = user.icon
    document.querySelector("#workspace__users").prepend(clone)
    notify(`"${user.username}" has joined the document`)
})

socket.on('member list', function (x) {
    document.querySelector("#workspace__users").innerHTML = ""
    for (let user of x) {
        let clone = document.querySelector("#template__user").content.cloneNode(true)
        clone.querySelector("div").setAttribute("data-name", user.username)
        clone.querySelector("img").src = user.icon
        document.querySelector("#workspace__users").prepend(clone)
    }
})

socket.on('leave member', (user) => {
    notify(`"${user.username}" has left the document`)
})

let declare_bounds = () => {
    let dimensions_wrapper = document.querySelector("#workspace").getBoundingClientRect()
    STATE.drag.boundsLeft = dimensions_wrapper.left
    STATE.drag.boundsTop = dimensions_wrapper.top
    STATE.drag.boundsRight = dimensions_wrapper.right
    STATE.drag.boundsBottom = dimensions_wrapper.bottom
}

// Straight from USACO Guide: https://usaco.guide/bronze/rect-geo?lang=cpp#implementation-2
let find_intersection = (a, b) => { // {bottom left x, bottom left y, top right x, top right y}
    let bl_a_x = a[0], bl_a_y = a[1], tr_a_x = a[2], tr_a_y = a[3];
	let bl_b_x = b[0], bl_b_y = b[1], tr_b_x = b[2], tr_b_y = b[3];

    if (bl_a_x >= tr_b_x || tr_a_x <= bl_b_x || bl_a_y >= tr_b_y ||
	    tr_a_y <= bl_b_y) {
		return -1;
	} else {
        return ((Math.min(tr_a_x, tr_b_x) - Math.max(bl_a_x, bl_b_x)) *
	        (Math.min(tr_a_y, tr_b_y) - Math.max(bl_a_y, bl_b_y)));
	}
}


let check_element = (e) => {
    if (e.classList.contains("original")){
        return false
    }


    for (let allowed of ["note", "subnote", "t-chart", "container"]){
        if (e.classList.contains(allowed)){
            return true
        }
    }

    return false
}

let find_overlaps = (element) => {
    let dimensions = element.getBoundingClientRect()
    let element_state = [dimensions.left, dimensions.top, dimensions.right, dimensions.bottom]

    let res = {
        "subnote": [],
        "note": [],
        "container": []
    }
    document.getElementById("workspace").querySelectorAll("*").forEach(e => {
        let d = e.getBoundingClientRect()
        let area = find_intersection(element_state, [d.left, d.top, d.right, d.bottom])
        if (area > 0 && check_element(e)){
            if (e.classList.contains("subnote")){
                res.subnote.push([area, e])
            }else if (e.classList.contains("note")){
                res.note.push([area, e])
            }else if (e.classList.contains("container")){
                res.container.push([area, e])
            }
        }
    })

    res.subnote.sort().reverse()
    res.note.sort().reverse()
    res.container.sort().reverse()

    return res
}


let events = {
    "container_mousedown": (e) => {
        let dimensions = e.currentTarget.getBoundingClientRect()
        STATE.drag.element = e.currentTarget
        STATE.drag.element.classList.add("dragged")

        declare_bounds()

        STATE.drag.offsetX = e.pageX - dimensions.left
        STATE.drag.offsetY = e.pageY - dimensions.top
        STATE.drag.find_overlaps = false
        e.stopPropagation()
    },
    "container_mouseup": (e) => {
        STATE.drag.element.classList.remove("dragged")
        STATE.drag.element = undefined
    },
    "note_mousedown": (e) => {
        let element = e.currentTarget.cloneNode(true)
        element.classList.add("original")
        e.currentTarget.classList.add("clone")
        Array.from(e.currentTarget.parentElement.children).at(-1).after(e.currentTarget)
        document.getElementById("workspace").append(element)

        STATE.data.components.push(STATE.components[e.currentTarget.getAttribute("data-id")])

        STATE.drag.orig = STATE.components[e.currentTarget.getAttribute("data-id")]
        STATE.components[e.currentTarget.getAttribute("data-id")] = STATE.data.components.at(-1)

        element = document.querySelector(".note.original:last-of-type")
        let dimensions = e.currentTarget.getBoundingClientRect()
        STATE.drag.element = element
        STATE.drag.element.classList.add("dragged")
        e.currentTarget.id += "_C"

        declare_bounds()

        STATE.drag.offsetX = e.pageX - dimensions.left
        STATE.drag.offsetY = e.pageY - dimensions.top

        element.style.top = e.pageY - STATE.drag.offsetY + "px"
        element.style.left = e.pageX - STATE.drag.offsetX + "px"

        e.stopPropagation()

        STATE.drag.find_overlaps = true
    },
    "note_mouseup": (e) => {
        let clones = document.querySelectorAll(".clone")

        for (let i = 1; i < clones.length; i++){clones[i].remove()}

        if (clones[0].style.display === "none"){ // direct child of "#workspace"
            clones[0].remove()
        }else{
            clones[0].classList.remove("clone")
            clones[0].classList.remove("dragged")
            clones[0].classList.remove("original")
            clones[0].style.top = ""
            clones[0].style.left = ""
            clones[0].style.display = "block"
            clones[0].id = clones[0].id.substring(0, clones[0].id.length - 2)
            STATE.components[clones[0].getAttribute("data-id")] = STATE.drag.orig
            STATE.data.components.splice(STATE.data.components.length - 1, 1)

            STATE.drag.element.remove()
        }

        STATE.drag.element = undefined

        e.stopPropagation()
    },
    "subnote_mousedown": (e) => {
        let element = e.currentTarget.cloneNode(true)
        element.classList.add("original")
        e.currentTarget.classList.add("clone")
        Array.from(e.currentTarget.parentElement.children).at(-1).after(e.currentTarget)
        document.getElementById("workspace").append(element)

        STATE.data.components.push(STATE.components[e.currentTarget.getAttribute("data-id")])

        STATE.drag.orig = STATE.components[e.currentTarget.getAttribute("data-id")]
        STATE.components[e.currentTarget.getAttribute("data-id")] = STATE.data.components.at(-1)

        element = document.querySelector(".subnote.original:last-of-type")
        let dimensions = e.currentTarget.getBoundingClientRect()
        STATE.drag.element = element
        STATE.drag.element.classList.add("dragged")
        e.currentTarget.id += "_C"

        declare_bounds()

        STATE.drag.offsetX = e.pageX - dimensions.left
        STATE.drag.offsetY = e.pageY - dimensions.top

        element.style.top = e.pageY - STATE.drag.offsetY + "px"
        element.style.left = e.pageX - STATE.drag.offsetX + "px"

        e.stopPropagation()

        STATE.drag.find_overlaps = true
    },
    "subnote_mouseup": (e) => {
        let clones = document.querySelectorAll(".clone")

        for (let i = 1; i < clones.length; i++){clones[i].remove()}

        if (clones[0].style.display === "none"){ // direct child of "#workspace"
            clones[0].remove()
        }else{
            clones[0].classList.remove("clone")
            clones[0].classList.remove("dragged")
            clones[0].classList.remove("original")
            clones[0].style.top = ""
            clones[0].style.left = ""
            clones[0].style.display = "block"
            clones[0].id = clones[0].id.substring(0, clones[0].id.length - 2)
            STATE.components[clones[0].getAttribute("data-id")] = STATE.drag.orig
            STATE.data.components.splice(STATE.data.components.length - 1, 1)

            STATE.drag.element.remove()
        }

        STATE.drag.element = undefined

        e.stopPropagation()
    },
    "window_mousedown": (e) => {
        STATE.drag.active = true
        STATE.viewpoint.prev_x = e.pageX
        STATE.viewpoint.prev_y = e.pageY
    },
    "window_mouseup": (e) => {
        STATE.drag.active = false
    },
    "window_mousemove": (e) => {
        if (STATE.drag.active){
            STATE.viewpoint.x += e.pageX - STATE.viewpoint.prev_x
            STATE.viewpoint.y += e.pageY - STATE.viewpoint.prev_y
            STATE.viewpoint.prev_x = e.pageX
            STATE.viewpoint.prev_y = e.pageY

            for (let e of STATE.data.components){
                regulate_position(document.getElementById("COMPONENT_" + e.id), e.x, e.y)
            }

            document.getElementById("workspace").style.backgroundPositionX = STATE.viewpoint.x + "px"
            document.getElementById("workspace").style.backgroundPositionY = STATE.viewpoint.y + "px"
        }
        if (STATE.drag.element){
            //STATE.drag.element.style.top = e.pageY - STATE.drag.offsetY + "px"
            //STATE.drag.element.style.left = e.pageX - STATE.drag.offsetX + "px"
            let id = STATE.drag.element.getAttribute("data-id")
            STATE.components[id].y = STATE.viewpoint.y + e.pageY - STATE.drag.offsetY - STATE.drag.boundsTop
            STATE.components[id].x = STATE.viewpoint.x + e.pageX - STATE.drag.offsetX - STATE.drag.boundsLeft

            // Snap System
            if (STATE.drag.find_overlaps){
                let res = find_overlaps(STATE.drag.element)

                let finished = false

                let order;
                if (STATE.drag.element.classList.contains("subnote")){
                    order = [...res.subnote, ...res.note, ...res.container]
                }else{
                    order = [...res.note, ...res.container]
                }

                for (let node of order){
                    if (node[1].parentElement.id === "workspace"){
                        continue
                    }
                    if (node[1].classList.contains("clone")){
                        finished = true
                        break
                    }

                    let curOrder = Number(node[1].style.order)

                    if (document.querySelector(".clone").parentElement === node[1].parentElement){
                        console.log("Go")
                        if (Number(document.querySelector(".clone").style.order) < curOrder){
                            document.querySelector(".clone").style.order = curOrder
                        }else{
                            document.querySelector(".clone").style.order = curOrder - 1
                        }
                    }else{
                        document.querySelector(".clone").style.display = "block"
                        let element = document.querySelector(".clone").cloneNode(true)
                        document.querySelectorAll(".clone").forEach(e=>e.remove())
                        element.classList.add("clone")
                        element.style.order = curOrder - 1
                        node[1].parentElement.append(element)
                    }

                    finished = true
                    break
                }

                if (!finished){
                    document.querySelector(".clone").style.display = "none"
                }
            }
            regulate_position(document.getElementById("COMPONENT_" + id), STATE.components[id].x, STATE.components[id].y)
        }
    }
}

let declare_events = (e) => {
    if (e.classList.contains("note")){
        e.addEventListener("mousedown", events.note_mousedown)
        e.addEventListener("mouseup", events.note_mouseup)
    }
    if (e.classList.contains("container")){
        e.addEventListener("mousedown", events.container_mousedown)
        e.addEventListener("mouseup", events.container_mouseup)
    }
    if (e.classList.contains("subnote")){
        e.addEventListener("mousedown", events.subnote_mousedown)
        e.addEventListener("mouseup", events.subnote_mouseup)
    }
    if (e.parentElement && e.parentElement.id === "workspace"){
        regulate_position(e, 0, 0)
    }
}

let regulate_position = (e, x, y) => {
    e.style.top = STATE.drag.boundsTop + STATE.viewpoint.y + y + "px"
    e.style.left = STATE.drag.boundsLeft + STATE.viewpoint.x + x + "px"
    let top = Math.max(-STATE.viewpoint.y - y, 0)
    let left = Math.max(-STATE.viewpoint.x - x, 0)
    let right = Math.max((STATE.drag.boundsLeft + STATE.viewpoint.x + x + e.offsetWidth- STATE.drag.boundsRight), 0)
    let bottom = Math.max((STATE.drag.boundsTop + STATE.viewpoint.y + y + e.offsetHeight - STATE.drag.boundsBottom), 0)
    e.style.clipPath = `inset(${top}px ${right}px ${bottom}px ${left}px)`
}

let get_cookie = (cName) => {
    const name = cName + "=";
    const cDecoded = decodeURIComponent(document.cookie); //to be careful
    const cArr = cDecoded.split('; ');
    let res;
    cArr.forEach(val => {
        if (val.indexOf(name) === 0) res = val.substring(name.length);
    })
    return res
}

let construct_tchart = (data) => {
    let chart = document.createElement("DIV")
    chart.classList.add("container")
    chart.classList.add("t-chart")
    chart.id = "COMPONENT_" + data.id
    chart.setAttribute("data-id", data.id)

    STATE.components[data.id] = data

    let i = 1;
    for (let child of data.children){
        let part = document.createElement("DIV")
        part.classList.add("container-group")
        part.style.order = i;

        part.id = "COMPONENT_" + child.id
        part.setAttribute("data-id", child.id)
        STATE.components[child.id] = child

        let name = document.createElement("DIV")
        name.classList.add("container-group-header")
        name.innerText = child.header

        part.append(name)

        let content = document.createElement("DIV")
        content.classList.add("container-group-content")

        let j = 1;
        for (let grandchild of child.children){
            let x = construct(grandchild)
            x.style.order = j;
            content.append(x)
            j += 1
        }

        part.append(content)

        chart.append(part)

        i += 1;
    }

    return chart
}

let construct_note = (data) => {
    let chart = document.createElement("DIV")
    chart.classList.add("note")

    chart.id = "COMPONENT_" + data.id
    chart.setAttribute("data-id", data.id)

    STATE.components[data.id] = data

    let header = document.createElement("DIV")
    header.classList.add("note_header")
    header.innerText += data.header

    chart.append(header)

    let content = document.createElement("DIV")
    content.classList.add("note_content")

    let i = 1;
    for (let child of data.children){
        let x = construct(child)
        x.style.order = i
        content.append(x)
        i += 1
    }

    chart.append(content)

    return chart
}

let construct_subnote = (data) => {
    let note = document.createElement("DIV")
    note.classList.add("subnote")
    note.innerText = data.content

    STATE.components[data.id] = data

    note.id = "COMPONENT_" + data.id
    note.setAttribute("data-id", data.id)

    return note
}

let construct_from_root = (data) => {
    // Metadata Setup
    document.querySelector("#workspace__name").value = data.name

    console.log(data, data.components)
    // Construction
    for (let component of data.components){
        document.getElementById("workspace").append(construct(component))
    }
}

let construct = (data) => {
    if (data.type === "T-Chart"){
        return construct_tchart(data)
    }
    if (data.type === "Note"){
        return construct_note(data)
    }
    if (data.type === "Subnote"){
        return construct_subnote(data)
    }
}

window.onload = () => {
    declare_bounds()
    STATE.height = document.getElementById("workspace").offsetHeight
    document.querySelectorAll("#workspace *").forEach(declare_events)

    document.querySelector("#workspace__wrapper").addEventListener("mousedown", events.window_mousedown)
    document.querySelector("#workspace__wrapper").addEventListener("mouseup", events.window_mouseup)
    document.querySelector("#workspace__wrapper").addEventListener("mousemove", events.window_mousemove)
    window.addEventListener("resize", declare_bounds)

    document.getElementById("workspace").addEventListener("DOMNodeInserted", e => {declare_events(e.target); e.target.querySelectorAll("*").forEach(declare_events)})
}

