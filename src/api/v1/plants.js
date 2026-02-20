const express = require('express');
const router = express.Router();
const { authenticateAPI } = require('../../middleware/auth');

router.get('/', authenticateAPI, async (req, res) => {
    try {
        const { organization_id } = req.query;
        res.status(200).json({
            organization_id: organization_id || 'org_1',
            plants: [
                { id: 'plant_1', name: 'Narmada Hydro 1', location: 'Gujarat, India', capacity_mw: 1450 }
            ]
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
