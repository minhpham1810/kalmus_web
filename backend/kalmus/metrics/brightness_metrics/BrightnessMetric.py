from kalmus.utils.artist import compute_mean_color


class BrightnessMetric:
    brightness_metric_types = {}
    """
    Contains references to every color metric class
    String identifiers used as keys
    """

    brightness_metric_type = "none"

    def __init_subclass__(cls, **kwargs):
        super().__init_subclass__(**kwargs)
        if cls.brightness_metric_type != "none":
            cls.brightness_metric_types[cls.brightness_metric_type] = cls
            print(f"Registered Brightness Metric: {cls.brightness_metric_type}")

    @classmethod
    def get_brightness(cls, frame):
        """
        Finds the brightness using the brightness metric type

        :param frame: The input frame
        :type frame: np.ndarray
        :return: The brightness
        :rtype: np.ndarray
        """
        return compute_mean_color(frame)
