const courier = document.getElementById('courier');
const deliveryOverlay = document.getElementById('deliveryOverlay');
const envelopeStand = document.getElementById('envelopeStand');
const envelopeStandBox = document.getElementById('envelopeStandBox');

const FLY_DURATION_MS = 3000;
const BIRD_EXIT_MS = 500;
const ENVELOPE_OPEN_MS = 700;

function resetAnimation() {
  courier.classList.remove('courier--fly', 'courier--bird-leave');
  envelopeStand.classList.add('hidden');
  envelopeStandBox.classList.remove('envelope--open');
  deliveryOverlay.classList.remove('delivery-overlay--fade');
}

function startCourierFlight() {
  resetAnimation();

  requestAnimationFrame(() => {
    courier.classList.add('courier--fly');
  });

  setTimeout(() => {
    courier.classList.add('courier--bird-leave');
    envelopeStand.classList.remove('hidden');

    setTimeout(() => {
      courier.classList.remove('courier--fly', 'courier--bird-leave');
      envelopeStandBox.classList.add('envelope--open');

      if (window.deliveryAPI?.signalEnvelopeOpen) {
        window.deliveryAPI.signalEnvelopeOpen();
      }

      deliveryOverlay.classList.add('delivery-overlay--fade');

      setTimeout(() => {
        if (window.deliveryAPI?.signalDeliveryFinished) {
          window.deliveryAPI.signalDeliveryFinished();
        }
      }, ENVELOPE_OPEN_MS);
    }, BIRD_EXIT_MS);
  }, FLY_DURATION_MS);
}

function playDelivery() {
  requestAnimationFrame(() => {
    requestAnimationFrame(startCourierFlight);
  });
}

if (window.deliveryAPI?.onStartDelivery) {
  window.deliveryAPI.onStartDelivery(playDelivery);
}
