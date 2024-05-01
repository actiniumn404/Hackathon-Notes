let URL = new URLSearchParams(location.search)

if (URL.has("err")){
    let err = document.createElement("DIV")
    err.id = "error"
    err.innerHTML = "<b>Error: </b>" + decodeURIComponent(URL.get("err"))
    document.getElementById("wrapper").prepend(err)
}