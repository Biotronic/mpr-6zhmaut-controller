// Accessible Semantic SCSS / Vanilla Number Input Knob / Potentiometer
// Created: 2020.10.11, 10:20h
(function (W, D) {
  var ks = D.querySelectorAll('knob-input input'),
    keys = { left:37, right:39, add:107, sub:109, home:36 , end:35, space:32, return:13, esc:27 },
    path = '<path d="M20,76 A 40 40 0 1 1 80 76"/>', // 184 svg units for full stroke
    curY = 0, moving = false, hasPE = W.PointerEvent;
  [].forEach.call(ks, function (k){ knob.call(k); });
  function knob () {
    var k = this, id = k.id || k.name,
      fls = k.parentElement,
      lbl = fls.querySelector('[for="'+id+'"]'),
      min = k.min ? parseFloat(k.min) : 0, 
      max = k.max ? parseFloat(k.max) : 100,
      dif = Math.abs(min) + Math.abs(max),
      stp = k.step ? parseFloat(k.step) : dif/10,
      val = k.value ? parseFloat(k.value) : dif/2,
      ind = fls.querySelector('svg path:last-of-type'),
      frm = k.form ? k.form : fls.parentElement;
    frm.lang = 'en'; k.value = val; k.step = stp;
    k.setAttribute('autocomplete','off');
    if(lbl) lbl.onclick = function(e){ e.preventDefault(); };
    if(!ind) ind = svg();
    // Event listener 
    k.addEventListener('input', input, false);
    k.onkeydown = knobkeys;
    fls.addEventListener('wheel', wheel, false);
    hasPE ? fls.onpointerdown = start : fls.onmousedown = start;
    ind.onclick = click;
    ind.previousElementSibling.onclick = click;
    input();
    function input () {
      val = k.value.trim();
      if(val > max) k.value = max;
      else if(val < min) k.value = min;
      else if(val === '') k.value = min;
      var per = (k.value/dif)*100, 
          deg = 0;
      if (per >= 0 && per <= 100 && per != 50) deg = per*1.32*2 - 132;
      ind.style.setProperty('stroke-dashoffset', -per*1.84 +'%');
      fls.style.setProperty('--knob-deg', deg);
    }
    function click (e) {
      if(k.disabled || k.readonly) return;
      var b = this.parentElement.getBoundingClientRect(),
        c  = { x: b.width/2, y: b.height/2 },
        p2 = { x: e.pageX - b.left, y: e.pageY - b.top },
        p1 = { x: 0, y: b.height };
      var rad = angle (p1, c, p2) ;
      var deg = rad * (180/Math.PI);
      if(p2.x > b.width/2 && deg < 180) deg = 360 - deg;
      k.value = parseInt((dif/270)*deg);
      k.dispatchEvent(new Event('input'));
    }
    function start (e) {
      if(k.disabled || k.readonly) return;
      moving = true; curY = e.pageY;
      D.addEventListener(hasPE ? 'pointermove' : 'mousemove', move, false);
      D.addEventListener(hasPE ? 'pointerup' : 'mouseup', end, false);
    }
    function move (e) {
      if(Math.abs(e.pageY - curY) > 400/(max - min)) {
        (e.pageY - curY) > 0 ? k.stepDown() : k.stepUp();
        k.dispatchEvent(new Event('input'));
        curY = e.pageY;
      }
    }
    function end (e) { 
      moving = false; curY = 0; 
      D.removeEventListener(hasPE ? 'pointermove' : 'mousemove', move, false);
      D.removeEventListener(hasPE ? 'pointerup' : 'mouseup', end, false);
      k.select();
    }
    function wheel (e) {
      var delta = e.deltaY;
      if(delta !== 0) {
        delta < 0 ? k.stepUp() : k.stepDown();
        k.dispatchEvent(new Event('input'));
      }
    }
    function knobkeys (e) {
      if(this !== D.activeElement) return;
      var c = e.keyCode ? e.keyCode : e.which;
      if (c === keys.left) { k.stepDown(); }
      else if (c === keys.down) { k.stepDown(); }
      else if (c === keys.right) { k.stepUp(); }
      else if (c === keys.up) { k.stepUp(); }
      else if (c === keys.end) { k.value = min; }
      else if (c === keys.home) { k.value = max; }
      else if (c === keys.add) { k.stepUp(); }
      else if (c === keys.sub) { k.stepDown(); }
      else if (c === keys.esc && lgd) { lgd.focus(); }
      k.dispatchEvent(new Event('input'));
    }
    function svg () { 
      var s = D.createElementNS('http://www.w3.org/2000/svg','svg'); 
      s.setAttribute('viewBox','0 0 100 100'); s.setAttribute('aria-hidden', true); 
      s.innerHTML = path + path; fls.appendChild(s);
      return s.querySelector('path:last-of-type');
    }
    function angle (p1, c, p2) { // Point 1, circle center point, point 2
      var p1c = Math.sqrt(Math.pow(c.x-p1.x, 2)+ Math.pow(c.y-p1.y, 2));    
      var cp2 = Math.sqrt(Math.pow(c.x-p2.x, 2)+ Math.pow(c.y-p2.y, 2)); 
      var p1p2 = Math.sqrt(Math.pow(p2.x-p1.x, 2)+ Math.pow(p2.y-p1.y, 2));
      return Math.acos((cp2*cp2 + p1c*p1c - p1p2*p1p2)/(2*cp2*p1c)) ;   
    }
  }
})(window, document);