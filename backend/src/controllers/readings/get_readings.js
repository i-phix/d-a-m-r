const { getReading: getReadingModel } = require('../../utils/damrSchemas');
const getReadings = async (req, res) => {
    try {
        const { meterId, facilityId, status, method, page = 1, limit = 30 } = req.query;
        const Reading = getReadingModel();
        const filter  = {};

        if (meterId)  filter.meterId  = meterId;
        if (status)   filter.status   = status;
        if (method)   filter.method   = method;
        if (req.user.role === 'Staff' || req.isMine) {
            filter.submittedBy = req.user._id;
        } else if (req.user.role === 'editor') {
            filter.facilityId = req.user.facilityId;
        } else if (facilityId) {
            filter.facilityId = facilityId;
        }

        const [readings, total] = await Promise.all([
            Reading.find(filter)
                .sort({ readingDate: -1 })
                .skip((Number(page) - 1) * Number(limit))
                .limit(Number(limit))
                .populate('meterId',    'serialNumber meterType')
                .populate('submittedBy','fullName email')
                .lean(),
            Reading.countDocuments(filter),
        ]);

        return res.status(200).send({ message: 'Readings fetched successfully', readings, total });
    } catch (err) {
        console.error('Error in getReadings:', err);
        return res.status(400).send({ error: err.message });
    }
};

module.exports = getReadings;
