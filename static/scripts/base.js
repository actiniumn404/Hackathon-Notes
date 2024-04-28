const templates = {
    prompt: document.querySelector("template#template__prompt")
}

let notify = (text) => {
    let notif = document.createElement("DIV")
    notif.classList.add("snackbar")
    notif.innerText = text
    document.body.append(notif)
    setTimeout(() => {notif.remove()}, 2800);
}