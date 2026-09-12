# FrictionFix

EEG-assisted usability-testing prototype for the NOVA buildathon.

- **Backend:** Python EEG processing, participant calibration, experiment metrics,
  adaptation requests and report export. [Setup](backend/README.md).
- **Frontend:** owned by the demo teammate. [Integration contract](backend/INTEGRATION.md)
  and [drop-in TypeScript client](backend/examples/frictionfix-client.ts).

The backend does not include the booking UI or an ANT hardware driver. Real EEG
requires a vendor stream/SDK connection. Recorded replay is explicitly labelled.

This is experimental software. The first supplied-data holdout evaluation is
documented in [validation](backend/VALIDATION.md); it does not establish website
confusion detection or a sale-ready product.
